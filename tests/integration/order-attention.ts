import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { CODES } from "../../src/lib/normalized";
import { tableService } from "../../src/modules/tables/table.service";
import { orderService } from "../../src/modules/orders/order.service";

const target = new URL(process.env.DATABASE_URL || "");
if (target.hostname !== "127.0.0.1" || target.port !== "55432" ||
    target.pathname !== "/bvm_attention_race_20261027" || target.username !== "bvm_test") {
  throw new Error("Solo se admite bvm_test@127.0.0.1:55432/bvm_attention_race_20261027");
}

function requireConflict(result: { error?: string; status?: number }) {
  assert.equal(result.status, 409, JSON.stringify(result));
}

async function main() {
  const db = new PrismaClient();
  try {
    const [identity] = await db.$queryRaw<Array<{ username: string; database: string; host: string; port: number }>>`
      SELECT current_user AS username, current_database() AS database,
        host(inet_server_addr()) AS host, inet_server_port() AS port
    `;
    assert.deepEqual(identity, {
      username: "bvm_test", database: "bvm_attention_race_20261027", host: "127.0.0.1", port: 55432
    });
    const employee = await db.user.findUniqueOrThrow({ where: { usuario: "empleado" } });
    const product = await db.producto.findFirstOrThrow({ where: { estado: { permiteVenta: true } } });
    const numero = 98000000 + randomInt(1, 1000000);
    const table = await tableService.create({ numero, capacidad: 4, descripcion: "Pedido atención aislada" });
    assert.ok("mesa" in table);
    const occupied = await tableService.update(table.mesa.id, {
      estado: "Ocupada", revisionEsperada: 0, atencionTokenEsperado: null
    }, employee.id);
    assert.ok("mesa" in occupied);
    const mesaId = occupied.mesa.id;
    const token = occupied.mesa.atencionToken;
    assert.ok(token);
    const oldToken = randomUUID();
    const input = { mesaId, usuarioId: employee.id, solicitudId: randomUUID(), items: [{ productoId: product.id, cantidad: 2 }] };

    requireConflict(await orderService.create({ ...input, atencionToken: oldToken }));
    assert.equal(await db.pedido.count({ where: { mesaId } }), 0);
    const missing = await orderService.create({ ...input, atencionToken: null });
    assert.ok("error" in missing && "status" in missing && missing.status === 400);
    assert.equal(await db.pedido.count({ where: { mesaId } }), 0);

    const created = await orderService.create({ ...input, atencionToken: token });
    assert.ok("pedido" in created && created.pedido);
    const pedidoId = created.pedido.id;
    const persisted = await db.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { items: true } });
    assert.equal(persisted.atencionToken, token);
    assert.equal(persisted.items.length, 1);
    assert.equal(Number(persisted.items[0].precioUnitario), Number(product.precio));
    assert.equal(Number(persisted.items[0].subtotal), Number(product.precio) * 2);

    requireConflict(await orderService.addItem(pedidoId, { productoId: product.id, atencionToken: oldToken, solicitudId: randomUUID() }));
    assert.equal(await db.pedidoItem.count({ where: { pedidoId } }), 1);
    const added = await orderService.addItem(pedidoId, { productoId: product.id, cantidad: 1, atencionToken: token, solicitudId: randomUUID() });
    assert.ok("item" in added && added.item);
    assert.equal(await db.pedidoItem.count({ where: { pedidoId } }), 2);

    requireConflict(await orderService.update(pedidoId, {
      estadoCocina: CODES.cocina.enPreparacion,
      estadoCocinaEsperado: CODES.cocina.pendiente,
      atencionToken: oldToken
    }));
    let current = await db.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { estadoCocina: true } });
    assert.equal(current.estadoCocina.codigo, CODES.cocina.pendiente);
    const prepared = await orderService.update(pedidoId, {
      estadoCocina: CODES.cocina.enPreparacion,
      estadoCocinaEsperado: CODES.cocina.pendiente,
      atencionToken: token
    });
    assert.ok("updated" in prepared);
    requireConflict(await orderService.update(pedidoId, {
      estadoCocina: CODES.cocina.listo,
      estadoCocinaEsperado: CODES.cocina.pendiente,
      atencionToken: token
    }));
    current = await db.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { estadoCocina: true } });
    assert.equal(current.estadoCocina.codigo, CODES.cocina.enPreparacion);

    requireConflict(await orderService.cancelItem(added.item.id, { motivo: "Sin stock", atencionToken: oldToken }));
    let item = await db.pedidoItem.findUniqueOrThrow({ where: { id: added.item.id }, include: { estado: true } });
    assert.equal(item.estado.esAnulado, false);
    const annulled = await orderService.cancelItem(added.item.id, { motivo: "Sin stock", atencionToken: token });
    assert.ok("updated" in annulled);
    item = await db.pedidoItem.findUniqueOrThrow({ where: { id: added.item.id }, include: { estado: true } });
    assert.equal(item.estado.esAnulado, true);
    assert.equal(item.motivoAnulacionDetalle, "Sin stock");
    const secondAnnulment = await orderService.cancelItem(added.item.id, { motivo: "Otro", atencionToken: token });
    assert.ok("error" in secondAnnulment);
    assert.equal((await db.pedidoItem.findUniqueOrThrow({ where: { id: added.item.id } })).motivoAnulacionDetalle, "Sin stock");

    const active = await db.pedidoEstado.findUniqueOrThrow({ where: { codigo: CODES.pedido.activo } });
    const pending = await db.pedidoEstadoCocina.findUniqueOrThrow({ where: { codigo: CODES.cocina.pendiente } });
    const historical = await db.pedido.create({ data: {
      mesaId, usuarioId: employee.id, estadoId: active.id, estadoCocinaId: pending.id,
      atencionToken: null,
      items: { create: [{ productoId: product.id, cantidad: 1,
        precioUnitario: product.precio, subtotal: product.precio }] }
    }, include: { items: true } });
    requireConflict(await orderService.addItem(historical.id, { productoId: product.id, atencionToken: token, solicitudId: randomUUID() }));
    requireConflict(await orderService.update(historical.id, { observacion: "Sin sal", atencionToken: token }));
    requireConflict(await orderService.cancelItem(historical.items[0].id, { motivo: "Otro", atencionToken: token }));
    assert.equal((await db.pedido.findUniqueOrThrow({ where: { id: historical.id } })).atencionToken, null);

    const nextToken = randomUUID();
    await db.mesa.update({ where: { id: mesaId }, data: { atencionToken: nextToken, revision: { increment: 1 } } });
    requireConflict(await orderService.update(pedidoId, { observacion: "Viejo", atencionToken: token }));
    requireConflict(await orderService.update(pedidoId, { observacion: "Nuevo", atencionToken: nextToken }));
    assert.equal((await db.pedido.findUniqueOrThrow({ where: { id: pedidoId } })).observacion, null);

    const evidence = { target: identity, mesaId, pedidoId, historicalPedidoId: historical.id,
      cases: ["create-current", "create-stale", "create-missing", "item-current", "item-stale",
        "kitchen-current", "kitchen-stale-token", "kitchen-stale-status", "cancel-current", "cancel-stale",
        "historical-null-token", "new-attention-rejects-old-order", "price-snapshot"],
      result: "APROBADA" };
    await writeFile("tests/evidence/order-attention-20261028.json", JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
