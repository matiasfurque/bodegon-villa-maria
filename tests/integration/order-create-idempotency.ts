import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { CODES } from "../../src/lib/normalized";
import { tableService } from "../../src/modules/tables/table.service";
import { orderService } from "../../src/modules/orders/order.service";
import { accountService } from "../../src/modules/accounts/account.service";

const target = new URL(process.env.DATABASE_URL || "");
if (target.hostname !== "127.0.0.1" || target.port !== "55432" ||
    target.pathname !== "/bvm_order_idempotency_20261028" || target.username !== "bvm_test") {
  throw new Error("Solo se admite bvm_test@127.0.0.1:55432/bvm_order_idempotency_20261028");
}

function orderOf(result: Awaited<ReturnType<typeof orderService.create>>) {
  assert.ok("pedido" in result && result.pedido, JSON.stringify(result));
  return result.pedido;
}

function conflict(result: Awaited<ReturnType<typeof orderService.create>>) {
  assert.ok("status" in result && result.status === 409, JSON.stringify(result));
}

async function main() {
  const db = new PrismaClient();
  let originalPrice: number | null = null;
  let productId: number | null = null;
  let triggerCreated = false;
  try {
    const [identity] = await db.$queryRaw<Array<{ username: string; database: string; host: string; port: number }>>`
      SELECT current_user AS username, current_database() AS database,
        host(inet_server_addr()) AS host, inet_server_port() AS port
    `;
    assert.deepEqual(identity, {
      username: "bvm_test", database: "bvm_order_idempotency_20261028", host: "127.0.0.1", port: 55432
    });
    const employee = await db.user.findUniqueOrThrow({ where: { usuario: "empleado" } });
    const product = await db.producto.findFirstOrThrow({ where: { estado: { permiteVenta: true } } });
    productId = product.id;
    originalPrice = Number(product.precio);
    async function occupiedTable() {
      const table = await tableService.create({ numero: 97000000 + randomInt(1, 1000000),
        capacidad: 4, descripcion: "Idempotencia pedido aislado" });
      if (!("mesa" in table) || !table.mesa) throw new Error("No se creó la mesa de prueba");
      const occupied = await tableService.update(table.mesa.id, {
        estado: "Ocupada", revisionEsperada: 0, atencionTokenEsperado: null
      }, employee.id);
      assert.ok("mesa" in occupied && occupied.mesa.atencionToken);
      return occupied.mesa;
    }

    const mesa = await occupiedTable();
    const solicitudId = randomUUID();
    const input = { mesaId: mesa.id, usuarioId: employee.id, atencionToken: mesa.atencionToken,
      solicitudId, observacion: "Mesa de prueba", items: [
        { productoId: product.id, cantidad: 1, observacion: "Entrada" },
        { productoId: product.id, cantidad: 2, observacion: "Principal" }
      ] };
    const first = await orderService.create(input);
    const firstOrder = orderOf(first);
    assert.ok("repeated" in first && !first.repeated);
    assert.equal(firstOrder.items.length, 2);
    assert.equal(firstOrder.solicitudId, solicitudId);
    assert.equal(firstOrder.solicitudHash?.length, 64);
    assert.equal(await db.pedido.count({ where: { solicitudId } }), 1);
    assert.equal(await db.pedidoItem.count({ where: { pedidoId: firstOrder.id } }), 2);
    assert.ok(firstOrder.items.every((item) => Number(item.precioUnitario) === originalPrice));

    await db.producto.update({ where: { id: product.id }, data: { precio: originalPrice + 100 } });
    const replay = await orderService.create(input);
    assert.ok("repeated" in replay && replay.repeated);
    assert.equal(orderOf(replay).id, firstOrder.id);
    assert.ok(orderOf(replay).items.every((item) => Number(item.precioUnitario) === originalPrice));
    assert.equal(await db.pedidoItem.count({ where: { pedidoId: firstOrder.id } }), 2);
    await db.producto.update({ where: { id: product.id }, data: { precio: originalPrice } });

    for (const changed of [
      { ...input, items: [{ ...input.items[0], cantidad: 3 }, input.items[1]] },
      { ...input, items: [{ ...input.items[0], productoId: product.id + 999999 }, input.items[1]] },
      { ...input, observacion: "Otra observación" },
      { ...input, items: [input.items[1], input.items[0]] },
      { ...input, atencionToken: randomUUID() }
    ]) conflict(await orderService.create(changed));
    assert.equal(await db.pedido.count({ where: { solicitudId } }), 1);

    const parallelId = randomUUID();
    const parallelInput = { ...input, solicitudId: parallelId };
    const parallel = await Promise.all([orderService.create(parallelInput), orderService.create(parallelInput)]);
    assert.equal(orderOf(parallel[0]).id, orderOf(parallel[1]).id);
    assert.deepEqual(parallel.map((result) => "repeated" in result && result.repeated).sort(), [false, true]);
    assert.equal(await db.pedido.count({ where: { solicitudId: parallelId } }), 1);
    assert.equal(await db.pedidoItem.count({ where: { pedidoId: orderOf(parallel[0]).id } }), 2);

    const differentPayloadId = randomUUID();
    const differentResults = await Promise.all([
      orderService.create({ ...input, solicitudId: differentPayloadId }),
      orderService.create({ ...input, solicitudId: differentPayloadId, observacion: "Diferente" })
    ]);
    assert.equal(differentResults.filter((result) => "pedido" in result).length, 1);
    assert.equal(differentResults.filter((result) => "status" in result && result.status === 409).length, 1);
    assert.equal(await db.pedido.count({ where: { solicitudId: differentPayloadId } }), 1);

    const differentIds = [randomUUID(), randomUUID()];
    for (const id of differentIds) orderOf(await orderService.create({ ...input, solicitudId: id }));
    assert.equal(await db.pedido.count({ where: { solicitudId: { in: differentIds } } }), 2);

    const otherMesa = await occupiedTable();
    const crossId = randomUUID();
    const cross = await Promise.all([
      orderService.create({ ...input, solicitudId: crossId }),
      orderService.create({ ...input, mesaId: otherMesa.id, atencionToken: otherMesa.atencionToken, solicitudId: crossId })
    ]);
    assert.equal(cross.filter((result) => "pedido" in result).length, 1);
    assert.equal(cross.filter((result) => "status" in result && result.status === 409).length, 1);
    assert.equal(await db.pedido.count({ where: { solicitudId: crossId } }), 1);

    const rollbackId = randomUUID();
    const rollbackInput = { ...input, mesaId: otherMesa.id, atencionToken: otherMesa.atencionToken,
      solicitudId: rollbackId, items: [{ productoId: product.id, cantidad: 1, observacion: "Primero" },
        { productoId: product.id, cantidad: 1, observacion: "FAIL_ORDER_CREATION" }] };
    await db.$executeRawUnsafe(`CREATE FUNCTION bvm_order_fail_item() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."observacion" = 'FAIL_ORDER_CREATION' THEN
        RAISE EXCEPTION 'isolated order rollback test'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER bvm_order_fail_item AFTER INSERT ON "PedidoItem"
      FOR EACH ROW EXECUTE FUNCTION bvm_order_fail_item()`);
    triggerCreated = true;
    await assert.rejects(orderService.create(rollbackInput), /isolated order rollback test/);
    assert.equal(await db.pedido.count({ where: { solicitudId: rollbackId } }), 0);
    await db.$executeRawUnsafe('DROP TRIGGER bvm_order_fail_item ON "PedidoItem"');
    await db.$executeRawUnsafe("DROP FUNCTION bvm_order_fail_item()");
    triggerCreated = false;
    const retried = orderOf(await orderService.create(rollbackInput));
    assert.equal(retried.items.length, 2);
    assert.equal(await db.pedidoItem.count({ where: { pedidoId: retried.id } }), 2);

    const closedMesa = await occupiedTable();
    const closedInput = { ...input, mesaId: closedMesa.id, atencionToken: closedMesa.atencionToken,
      solicitudId: randomUUID() };
    const closedOrder = orderOf(await orderService.create(closedInput));
    let expected: string = CODES.cocina.pendiente;
    for (const next of [CODES.cocina.enPreparacion, CODES.cocina.listo, CODES.cocina.entregado]) {
      const updated = await orderService.update(closedOrder.id, {
        estadoCocina: next, estadoCocinaEsperado: expected, atencionToken: closedMesa.atencionToken,
        ...(next === CODES.cocina.listo ? { revisionContenidoEsperada: (await db.pedido.findUniqueOrThrow({ where: { id: closedOrder.id } })).revisionContenido } : {})
      });
      assert.ok("updated" in updated);
      expected = next;
    }
    await accountService.close({ mesaId: closedMesa.id, atencionToken: closedMesa.atencionToken,
      usuarioCierreId: employee.id, montoRecibido: originalPrice * 3 });
    const afterClose = await orderService.create(closedInput);
    assert.ok("repeated" in afterClose && afterClose.repeated);
    assert.equal(orderOf(afterClose).id, closedOrder.id);
    assert.equal(orderOf(afterClose).estado.esActivo, false);
    assert.equal(await db.pedido.count({ where: { solicitudId: closedInput.solicitudId } }), 1);
    const freshId = randomUUID();
    const releasedAttempt = await orderService.create({ ...closedInput, solicitudId: freshId });
    assert.ok("error" in releasedAttempt);
    assert.equal(await db.pedido.count({ where: { solicitudId: freshId } }), 0);
    const released = await db.mesa.findUniqueOrThrow({ where: { id: closedMesa.id } });
    const reopened = await tableService.update(closedMesa.id, { estado: "Ocupada",
      revisionEsperada: released.revision, atencionTokenEsperado: null }, employee.id);
    assert.ok("mesa" in reopened && reopened.mesa.atencionToken !== closedMesa.atencionToken);
    conflict(await orderService.create({ ...closedInput, solicitudId: randomUUID() }));
    assert.equal(await db.pedido.count({ where: { mesaId: closedMesa.id } }), 1);

    const finalized = await db.pedidoEstado.findUniqueOrThrow({ where: { codigo: CODES.pedido.finalizado } });
    const pending = await db.pedidoEstadoCocina.findUniqueOrThrow({ where: { codigo: CODES.cocina.pendiente } });
    for (let index = 0; index < 2; index++) {
      await db.pedido.create({ data: { mesaId: otherMesa.id, usuarioId: employee.id,
        estadoId: finalized.id, estadoCocinaId: pending.id, atencionToken: null } });
    }
    assert.ok(await db.pedido.count({ where: { mesaId: otherMesa.id, solicitudId: null } }) >= 2);

    const evidence = { target: identity, tableId: mesa.id, originalOrderId: firstOrder.id,
      cases: ["first-creation", "lost-response-replay", "historical-price", "content-conflict",
        "identical-concurrency", "different-content-concurrency", "distinct-uuids", "cross-table-unique",
        "multi-item-rollback", "retry-after-rollback", "replay-after-account-close",
        "old-attention-unprocessed-rejected", "historical-null-uuids"], result: "APROBADA" };
    await writeFile("tests/evidence/order-create-idempotency-20261028.json", JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    if (triggerCreated) {
      await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS bvm_order_fail_item ON "PedidoItem"');
      await db.$executeRawUnsafe("DROP FUNCTION IF EXISTS bvm_order_fail_item()");
    }
    if (productId !== null && originalPrice !== null) {
      await db.producto.update({ where: { id: productId }, data: { precio: originalPrice } });
    }
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
