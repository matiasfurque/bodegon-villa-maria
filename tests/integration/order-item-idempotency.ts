import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { CODES } from "../../src/lib/normalized";
import { tableService } from "../../src/modules/tables/table.service";
import { orderService } from "../../src/modules/orders/order.service";

const target = new URL(process.env.DATABASE_URL || "");
if (target.hostname !== "127.0.0.1" || target.port !== "55432" ||
    target.pathname !== "/bvm_item_idempotency_20261028" || target.username !== "bvm_test") {
  throw new Error("Solo se admite bvm_test@127.0.0.1:55432/bvm_item_idempotency_20261028");
}

function itemOf(result: Awaited<ReturnType<typeof orderService.addItem>>) {
  assert.ok("item" in result && result.item, JSON.stringify(result));
  return result.item;
}

async function main() {
  const db = new PrismaClient();
  let productId: number | null = null;
  let originalPrice: number | null = null;
  let triggerCreated = false;
  try {
    const [identity] = await db.$queryRaw<Array<{ username: string; database: string; host: string; port: number }>>`
      SELECT current_user AS username, current_database() AS database,
        host(inet_server_addr()) AS host, inet_server_port() AS port
    `;
    assert.deepEqual(identity, {
      username: "bvm_test", database: "bvm_item_idempotency_20261028", host: "127.0.0.1", port: 55432
    });
    const employee = await db.user.findUniqueOrThrow({ where: { usuario: "empleado" } });
    const product = await db.producto.findFirstOrThrow({ where: { estado: { permiteVenta: true } } });
    productId = product.id;
    originalPrice = Number(product.precio);
    const table = await tableService.create({ numero: 99000000 + randomInt(1, 1000000), capacidad: 4, descripcion: "Idempotencia aislada" });
    if (!("mesa" in table) || !table.mesa) throw new Error("No se creó la mesa de prueba");
    const occupied = await tableService.update(table.mesa.id, {
      estado: "Ocupada", revisionEsperada: 0, atencionTokenEsperado: null
    }, employee.id);
    assert.ok("mesa" in occupied && occupied.mesa.atencionToken);
    const token = occupied.mesa.atencionToken;
    const create = () => orderService.create({ mesaId: occupied.mesa.id, usuarioId: employee.id, solicitudId: randomUUID(),
      atencionToken: token, items: [{ productoId: product.id, cantidad: 1 }] });
    const initial = await create();
    assert.ok("pedido" in initial && initial.pedido);
    const pedidoId = initial.pedido.id;
    assert.equal(initial.pedido.items[0].solicitudId, null);

    const requestId = randomUUID();
    const payload = { productoId: product.id, cantidad: 2, observacion: "Sin hielo", atencionToken: token, solicitudId: requestId };
    const first = await orderService.addItem(pedidoId, payload);
    const firstItem = itemOf(first);
    assert.ok("repeated" in first && !first.repeated);
    assert.equal(firstItem.solicitudId, requestId);
    assert.equal(Number(firstItem.precioUnitario), originalPrice);
    assert.equal(Number(firstItem.subtotal), originalPrice * 2);
    assert.equal((await db.pedidoItem.findUniqueOrThrow({ where: { solicitudId: requestId } })).solicitudHash?.length, 64);

    await db.producto.update({ where: { id: product.id }, data: { precio: originalPrice + 100 } });
    const replay = await orderService.addItem(pedidoId, payload);
    assert.ok("repeated" in replay && replay.repeated);
    assert.equal(itemOf(replay).id, firstItem.id);
    assert.equal(Number(itemOf(replay).precioUnitario), originalPrice);
    assert.equal(await db.pedidoItem.count({ where: { solicitudId: requestId } }), 1);
    await db.producto.update({ where: { id: product.id }, data: { precio: originalPrice } });

    for (const changed of [{ ...payload, cantidad: 3 }, { ...payload, observacion: "Otro" },
      { ...payload, productoId: product.id + 999999 }, { ...payload, atencionToken: randomUUID() }]) {
      const conflict = await orderService.addItem(pedidoId, changed);
      assert.ok("status" in conflict && conflict.status === 409);
    }
    const another = await create();
    assert.ok("pedido" in another && another.pedido);
    const crossOrder = await orderService.addItem(another.pedido.id, payload);
    assert.ok("status" in crossOrder && crossOrder.status === 409);
    assert.equal(await db.pedidoItem.count({ where: {
      solicitudId: null, pedidoId: { in: [pedidoId, another.pedido.id] }
    } }), 2);

    const concurrentId = randomUUID();
    const concurrentPayload = { ...payload, solicitudId: concurrentId };
    const concurrent = await Promise.all([
      orderService.addItem(pedidoId, concurrentPayload), orderService.addItem(pedidoId, concurrentPayload)
    ]);
    assert.equal(itemOf(concurrent[0]).id, itemOf(concurrent[1]).id);
    assert.deepEqual(concurrent.map((result) => "repeated" in result && result.repeated).sort(), [false, true]);
    assert.equal(await db.pedidoItem.count({ where: { solicitudId: concurrentId } }), 1);

    const distinctIds = [randomUUID(), randomUUID()];
    for (const solicitudId of distinctIds) itemOf(await orderService.addItem(pedidoId, { ...payload, solicitudId }));
    assert.equal(await db.pedidoItem.count({ where: { solicitudId: { in: distinctIds } } }), 2);

    const staleId = randomUUID();
    const stale = await orderService.addItem(pedidoId, { ...payload, solicitudId: staleId, atencionToken: randomUUID() });
    assert.ok("status" in stale && stale.status === 409);
    assert.equal(await db.pedidoItem.count({ where: { solicitudId: staleId } }), 0);
    for (const solicitudId of [undefined, "invalid"]) {
      const invalid = await orderService.addItem(pedidoId, { ...payload, solicitudId });
      assert.ok("status" in invalid && invalid.status === 400);
    }

    for (const [from, to] of [[CODES.cocina.pendiente, CODES.cocina.enPreparacion],
      [CODES.cocina.enPreparacion, CODES.cocina.listo]]) {
      const update = await orderService.update(pedidoId, { estadoCocina: to, estadoCocinaEsperado: from,
        atencionToken: token,
        ...(to === CODES.cocina.listo ? { revisionContenidoEsperada: (await db.pedido.findUniqueOrThrow({ where: { id: pedidoId } })).revisionContenido } : {}) });
      assert.ok("updated" in update);
    }
    const afterStateChange = await orderService.addItem(pedidoId, payload);
    assert.ok("repeated" in afterStateChange && afterStateChange.repeated);
    assert.equal(itemOf(afterStateChange).id, firstItem.id);
    const newOnClosedKitchen = await orderService.addItem(pedidoId, { ...payload, solicitudId: randomUUID() });
    assert.ok("error" in newOnClosedKitchen);

    const rollbackId = randomUUID();
    await db.$executeRawUnsafe(`CREATE FUNCTION bvm_idempotency_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."solicitudId" = '${rollbackId}'::uuid THEN
        RAISE EXCEPTION 'isolated rollback test'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER bvm_idempotency_fail AFTER INSERT ON "PedidoItem"
      FOR EACH ROW EXECUTE FUNCTION bvm_idempotency_fail()`);
    triggerCreated = true;
    const rollbackPayload = { ...payload, solicitudId: rollbackId };
    await assert.rejects(orderService.addItem(another.pedido.id, rollbackPayload), /isolated rollback test/);
    assert.equal(await db.pedidoItem.count({ where: { solicitudId: rollbackId } }), 0);
    await db.$executeRawUnsafe('DROP TRIGGER bvm_idempotency_fail ON "PedidoItem"');
    await db.$executeRawUnsafe("DROP FUNCTION bvm_idempotency_fail()");
    triggerCreated = false;
    const retried = await orderService.addItem(another.pedido.id, rollbackPayload);
    assert.ok("repeated" in retried && !retried.repeated);
    assert.equal(await db.pedidoItem.count({ where: { solicitudId: rollbackId } }), 1);

    const cancelled = await orderService.cancelItem(firstItem.id, { motivo: "Cliente canceló", atencionToken: token });
    assert.ok("updated" in cancelled);
    const replayAfterCancellation = await orderService.addItem(pedidoId, payload);
    assert.ok("repeated" in replayAfterCancellation && replayAfterCancellation.repeated);
    assert.equal(itemOf(replayAfterCancellation).id, firstItem.id);
    assert.equal(itemOf(replayAfterCancellation).estado.esAnulado, true);
    assert.equal(await db.pedidoItem.count({ where: { solicitudId: requestId } }), 1);

    const evidence = { target: identity, mesaId: occupied.mesa.id, pedidoId, firstItemId: firstItem.id,
      cases: ["first-create", "lost-response-replay", "content-conflict", "order-conflict", "same-uuid-concurrent",
        "distinct-uuids", "stale-attention", "invalid-uuid", "replay-after-status-change", "historical-price",
        "historical-null", "rollback-and-retry", "replay-after-cancellation"], result: "APROBADA" };
    await writeFile("tests/evidence/order-item-idempotency-20261028.json", JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    if (triggerCreated) {
      await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS bvm_idempotency_fail ON "PedidoItem"');
      await db.$executeRawUnsafe("DROP FUNCTION IF EXISTS bvm_idempotency_fail()");
    }
    if (productId !== null && originalPrice !== null) {
      await db.producto.update({ where: { id: productId }, data: { precio: originalPrice } });
    }
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
