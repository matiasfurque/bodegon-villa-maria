import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { CODES } from "../../src/lib/normalized";
import { orderService } from "../../src/modules/orders/order.service";
import { tableService } from "../../src/modules/tables/table.service";

const target = new URL(process.env.DATABASE_URL || "");
if (target.hostname !== "127.0.0.1" || target.port !== "55432" ||
    target.username !== "bvm_test" || target.pathname !== "/bvm_kitchen_revision_20261028") {
  throw new Error("Solo se admite bvm_test@127.0.0.1:55432/bvm_kitchen_revision_20261028");
}

async function main() {
  const db = new PrismaClient();
  const holder = new PrismaClient();
  let triggerCreated = false;
  try {
    const [identity] = await db.$queryRaw<Array<{ username: string; database: string; host: string; port: number }>>`
      SELECT current_user AS username, current_database() AS database,
        host(inet_server_addr()) AS host, inet_server_port() AS port`;
    assert.deepEqual(identity, { username: "bvm_test", database: "bvm_kitchen_revision_20261028", host: "127.0.0.1", port: 55432 });
    const employee = await db.user.findUniqueOrThrow({ where: { usuario: "empleado" } });
    const product = await db.producto.findFirstOrThrow({ where: { estado: { permiteVenta: true } } });

    async function order() {
      const created = await tableService.create({ numero: 99000000 + randomInt(1, 1000000), capacidad: 4, descripcion: "Cocina test" });
      if (!("mesa" in created) || !created.mesa) throw new Error("No se pudo crear la mesa ficticia");
      const occupied = await tableService.update(created.mesa.id, { estado: "Ocupada",
        revisionEsperada: created.mesa.revision, atencionTokenEsperado: null }, employee.id);
      assert.ok("mesa" in occupied && occupied.mesa.atencionToken);
      const token = occupied.mesa.atencionToken!;
      const result = await orderService.create({ mesaId: occupied.mesa.id, usuarioId: employee.id,
        atencionToken: token, solicitudId: randomUUID(), items: [{ productoId: product.id, cantidad: 1 }] });
      assert.ok("pedido" in result && result.pedido);
      assert.equal(result.pedido.revisionContenido, 0);
      const preparing = await orderService.update(result.pedido.id, {
        atencionToken: token, estadoCocina: CODES.cocina.enPreparacion, estadoCocinaEsperado: CODES.cocina.pendiente
      });
      assert.ok("updated" in preparing);
      return { mesaId: occupied.mesa.id, pedidoId: result.pedido.id, itemId: result.pedido.items[0].id, token };
    }

    async function waitForBlocked(expected: number) {
      for (let attempt = 0; attempt < 45; attempt++) {
        const [row] = await db.$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        if (row.count >= expected) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`No se observaron ${expected} solicitudes bloqueadas`);
    }

    async function race(first: "kitchen" | "waiter") {
      const fixture = await order();
      let locked!: () => void;
      let release!: () => void;
      const acquired = new Promise<void>((resolve) => { locked = resolve; });
      const released = new Promise<void>((resolve) => { release = resolve; });
      const holding = holder.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${fixture.mesaId} FOR UPDATE`;
        locked();
        await released;
      }, { timeout: 10000 });
      await acquired;
      const solicitudId = randomUUID();
      const kitchen = () => orderService.update(fixture.pedidoId, { atencionToken: fixture.token,
        estadoCocina: CODES.cocina.listo, estadoCocinaEsperado: CODES.cocina.enPreparacion,
        revisionContenidoEsperada: 0 });
      const waiter = () => orderService.addItem(fixture.pedidoId, { atencionToken: fixture.token,
        solicitudId, productoId: product.id, cantidad: 1 });
      let firstResult!: ReturnType<typeof kitchen> | ReturnType<typeof waiter>;
      let secondResult!: ReturnType<typeof kitchen> | ReturnType<typeof waiter>;
      try {
        firstResult = first === "kitchen" ? kitchen() : waiter();
        await waitForBlocked(1);
        secondResult = first === "kitchen" ? waiter() : kitchen();
        await waitForBlocked(2);
      } finally {
        release();
      }
      await holding;
      const firstValue = await firstResult;
      const secondValue = await secondResult;
      const pedido = await db.pedido.findUniqueOrThrow({ where: { id: fixture.pedidoId },
        include: { estadoCocina: true, items: true } });
      return { fixture, firstValue, secondValue, revision: pedido.revisionContenido,
        kitchenState: pedido.estadoCocina.codigo, items: pedido.items.length,
        newItemCount: await db.pedidoItem.count({ where: { solicitudId } }) };
    }

    const kitchenFirst = await race("kitchen");
    assert.ok("updated" in kitchenFirst.firstValue);
    assert.ok("error" in kitchenFirst.secondValue);
    assert.equal(kitchenFirst.revision, 0);
    assert.equal(kitchenFirst.items, 1);
    assert.equal(kitchenFirst.newItemCount, 0);
    assert.equal(kitchenFirst.kitchenState, CODES.cocina.listo);

    const waiterFirst = await race("waiter");
    assert.ok("item" in waiterFirst.firstValue);
    assert.ok("error" in waiterFirst.secondValue && "status" in waiterFirst.secondValue && waiterFirst.secondValue.status === 409);
    assert.equal(waiterFirst.revision, 1);
    assert.equal(waiterFirst.items, 2);
    assert.equal(waiterFirst.newItemCount, 1);
    assert.equal(waiterFirst.kitchenState, CODES.cocina.enPreparacion);
    const reviewed = await orderService.update(waiterFirst.fixture.pedidoId, {
      atencionToken: waiterFirst.fixture.token, estadoCocina: CODES.cocina.listo,
      estadoCocinaEsperado: CODES.cocina.enPreparacion, revisionContenidoEsperada: 1
    });
    assert.ok("updated" in reviewed);

    const cancelledFixture = await order();
    const cancelled = await orderService.cancelItem(cancelledFixture.itemId, { atencionToken: cancelledFixture.token, motivo: "Sin stock" });
    assert.ok("updated" in cancelled);
    const cancelledRevision = await db.pedido.findUniqueOrThrow({ where: { id: cancelledFixture.pedidoId } });
    assert.equal(cancelledRevision.revisionContenido, 1);
    const staleAfterCancel = await orderService.update(cancelledFixture.pedidoId, {
      atencionToken: cancelledFixture.token, estadoCocina: CODES.cocina.listo,
      estadoCocinaEsperado: CODES.cocina.enPreparacion, revisionContenidoEsperada: 0
    });
    assert.ok("error" in staleAfterCancel && staleAfterCancel.status === 409);

    const rollbackFixture = await order();
    await db.$executeRawUnsafe(`CREATE FUNCTION bvm_reject_revision_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."revisionContenido" > OLD."revisionContenido" THEN RAISE EXCEPTION 'Rollback de prueba'; END IF;
      RETURN NEW; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER bvm_reject_revision_test BEFORE UPDATE ON "Pedido"
      FOR EACH ROW EXECUTE FUNCTION bvm_reject_revision_test()`);
    triggerCreated = true;
    const rollbackSolicitudId = randomUUID();
    let rolledBack = false;
    try {
      await orderService.addItem(rollbackFixture.pedidoId, { atencionToken: rollbackFixture.token,
        solicitudId: rollbackSolicitudId, productoId: product.id, cantidad: 1 });
    } catch { rolledBack = true; }
    assert.equal(rolledBack, true);
    assert.equal(await db.pedidoItem.count({ where: { solicitudId: rollbackSolicitudId } }), 0);
    assert.equal((await db.pedido.findUniqueOrThrow({ where: { id: rollbackFixture.pedidoId } })).revisionContenido, 0);

    const evidence = { identity, kitchenFirst: { revision: kitchenFirst.revision, items: kitchenFirst.items,
      newItemCount: kitchenFirst.newItemCount, kitchenState: kitchenFirst.kitchenState,
      kitchenAccepted: "updated" in kitchenFirst.firstValue, waiterRejected: "error" in kitchenFirst.secondValue },
      waiterFirst: { revision: waiterFirst.revision, items: waiterFirst.items,
        newItemCount: waiterFirst.newItemCount, kitchenStateBeforeReview: waiterFirst.kitchenState,
        kitchenConflictStatus: "error" in waiterFirst.secondValue && "status" in waiterFirst.secondValue
          ? waiterFirst.secondValue.status : null,
        acceptedAfterReview: "updated" in reviewed },
      cancelled: { revision: cancelledRevision.revisionContenido,
        staleStatus: "error" in staleAfterCancel ? staleAfterCancel.status : null },
      rollback: { errorRaised: rolledBack, persistedItemCount: 0, revision: 0 } };
    await writeFile("tests/evidence/kitchen-content-revision-20261028.json", JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    if (triggerCreated) {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS bvm_reject_revision_test ON "Pedido"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS bvm_reject_revision_test()`);
    }
    await holder.$disconnect();
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
