import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";
import { createSessionCookie } from "../../src/lib/auth";
import { CODES } from "../../src/lib/normalized";
import { GET as getConsumos } from "../../src/app/api/consumos/route";
import { GET as getPedidos } from "../../src/app/api/pedidos/route";
import { accountService } from "../../src/modules/accounts/account.service";
import { orderService } from "../../src/modules/orders/order.service";
import { tableService } from "../../src/modules/tables/table.service";

const target = new URL(process.env.DATABASE_URL || "");
if (target.hostname !== "127.0.0.1" || target.port !== "55433" ||
    target.username !== "bvm_test" || target.pathname !== "/bvm_attention_isolation_20261028") {
  throw new Error("Solo se admite bvm_test@127.0.0.1:55433/bvm_attention_isolation_20261028");
}

async function main() {
  const db = new PrismaClient();
  try {
    const [identity] = await db.$queryRaw<Array<{ username: string; database: string; host: string; port: number }>>`
      SELECT current_user AS username, current_database() AS database,
        host(inet_server_addr()) AS host, inet_server_port() AS port`;
    assert.deepEqual(identity, { username: "bvm_test", database: "bvm_attention_isolation_20261028", host: "127.0.0.1", port: 55433 });

    const employee = await db.user.findUniqueOrThrow({ where: { usuario: "empleado" } });
    const secondEmployee = await db.user.create({ data: {
      nombre: "Empleado", apellido: "Ficticio", usuario: `empleado-test-${randomUUID()}`,
      passwordHash: employee.passwordHash, roleId: employee.roleId, estadoId: employee.estadoId
    } });
    const product = await db.producto.findFirstOrThrow({ where: { estado: { permiteVenta: true } } });
    const activeState = await db.pedidoEstado.findUniqueOrThrow({ where: { codigo: CODES.pedido.activo } });
    const cancelledState = await db.pedidoEstado.findUniqueOrThrow({ where: { codigo: CODES.pedido.anulado } });
    const kitchenPending = await db.pedidoEstadoCocina.findUniqueOrThrow({ where: { codigo: CODES.cocina.pendiente } });
    const activeItem = await db.pedidoItemEstado.findUniqueOrThrow({ where: { codigo: CODES.item.activo } });

    async function newTable() {
      const created = await tableService.create({ numero: 96000000 + randomInt(1, 1000000), capacidad: 4, descripcion: "Ensayo aislado" });
      assert.ok("mesa" in created && created.mesa);
      const occupied = await tableService.update(created.mesa.id, { estado: "Ocupada",
        revisionEsperada: created.mesa.revision, atencionTokenEsperado: null }, employee.id);
      assert.ok("mesa" in occupied && occupied.mesa.atencionToken);
      return occupied.mesa;
    }

    async function newOrder(mesaId: number, atencionToken: string, usuarioId: number) {
      const result = await orderService.create({ mesaId, atencionToken, usuarioId,
        solicitudId: randomUUID(), items: [{ productoId: product.id, cantidad: 1 }] });
      assert.ok("pedido" in result && result.pedido);
      return result.pedido;
    }

    const cookie = createSessionCookie(employee);
    async function consumos(mesaId: number) {
      const response = await getConsumos(new NextRequest(`http://localhost/api/consumos?mesaId=${mesaId}`, {
        headers: { cookie: `bvm_session=${cookie}` }
      }));
      assert.equal(response.status, 200);
      return response.json() as Promise<{ mesa: { pedidos: Array<{ id: number; atencionToken: string; items: Array<{ id: number; subtotal: string }> }> }; total: number }>;
    }
    async function pedidos(mesaId?: number) {
      const suffix = mesaId === undefined ? "" : `?mesaId=${mesaId}`;
      const response = await getPedidos(new NextRequest(`http://localhost/api/pedidos${suffix}`, {
        headers: { cookie: `bvm_session=${cookie}` }
      }));
      assert.equal(response.status, 200);
      return response.json() as Promise<Array<{ id: number }>>;
    }

    const tableA = await newTable();
    const tokenA = tableA.atencionToken!;
    const orderA = await newOrder(tableA.id, tokenA, employee.id);
    const amountA = Number(orderA.items[0].subtotal);
    const initial = await consumos(tableA.id);
    assert.equal(initial.total, amountA);
    assert.deepEqual(initial.mesa.pedidos.map((order) => order.id), [orderA.id]);

    let expectedKitchen: string = CODES.cocina.pendiente;
    for (const next of [CODES.cocina.enPreparacion, CODES.cocina.listo, CODES.cocina.entregado]) {
      const result = await orderService.update(orderA.id, { atencionToken: tokenA,
        estadoCocina: next, estadoCocinaEsperado: expectedKitchen,
        ...(next === CODES.cocina.listo ? { revisionContenidoEsperada: 0 } : {}) });
      assert.ok("updated" in result);
      expectedKitchen = next;
    }
    const accountA = await accountService.close({ mesaId: tableA.id, atencionToken: tokenA,
      usuarioCierreId: employee.id, metodoPago: CODES.pago.efectivo, montoRecibido: amountA + 1000 });
    assert.equal(Number(accountA.total), amountA);
    assert.equal((await consumos(tableA.id)).total, 0);

    const afterClose = await db.mesa.findUniqueOrThrow({ where: { id: tableA.id } });
    const reopened = await tableService.update(tableA.id, { estado: "Ocupada",
      revisionEsperada: afterClose.revision, atencionTokenEsperado: null }, employee.id);
    assert.ok("mesa" in reopened && reopened.mesa.atencionToken);
    const tokenB = reopened.mesa.atencionToken!;
    assert.notEqual(tokenB, tokenA);

    const [firstB, secondB] = await Promise.all([
      newOrder(tableA.id, tokenB, employee.id),
      newOrder(tableA.id, tokenB, secondEmployee.id)
    ]);
    assert.notEqual(firstB.id, secondB.id);
    const cancelled = await orderService.cancelItem(secondB.items[0].id, { atencionToken: tokenB, motivo: "Cliente canceló" });
    assert.ok("updated" in cancelled);
    const current = await consumos(tableA.id);
    assert.deepEqual(current.mesa.pedidos.map((order) => order.id).sort(), [firstB.id, secondB.id].sort());
    assert.equal(current.total, Number(firstB.items[0].subtotal));
    assert.equal(current.mesa.pedidos.find((order) => order.id === secondB.id)?.items.length, 0);
    assert.equal(current.mesa.pedidos.every((order) => order.atencionToken === tokenB), true);
    const history = await accountService.list({ mesaId: tableA.id, hasDateFilter: false });
    assert.ok(history.some((account) => account.id === accountA.id && account.atencionToken === tokenA &&
      Number(account.total) === amountA && account.detalles.length === 1));

    const rogueA = await db.pedido.create({ data: { mesaId: tableA.id, usuarioId: employee.id,
      atencionToken: tokenA, estadoId: activeState.id, estadoCocinaId: kitchenPending.id,
      items: { create: [{ productoId: product.id, cantidad: 1, precioUnitario: product.precio,
        subtotal: product.precio, estadoId: activeItem.id }] } } });
    const beforeReject = await db.mesa.findUniqueOrThrow({ where: { id: tableA.id } });
    const releaseInput = { revisionEsperada: beforeReject.revision, atencionTokenEsperado: tokenB };
    const foreignOnlyRelease = await tableService.update(tableA.id, { estado: "Libre", ...releaseInput }, employee.id);
    const foreignOnlyRemove = await tableService.remove(tableA.id, releaseInput);
    assert.ok("error" in foreignOnlyRelease && foreignOnlyRelease.status === 409);
    assert.ok("error" in foreignOnlyRemove && foreignOnlyRemove.status === 409);
    assert.equal((await db.pedido.findUniqueOrThrow({ where: { id: rogueA.id } })).estadoId, activeState.id);

    const rogueNull = await db.pedido.create({ data: { mesaId: tableA.id, usuarioId: secondEmployee.id,
      atencionToken: null, estadoId: activeState.id, estadoCocinaId: kitchenPending.id } });
    const isolated = await consumos(tableA.id);
    assert.equal(isolated.total, current.total);
    assert.equal(isolated.mesa.pedidos.some((order) => [rogueA.id, rogueNull.id, orderA.id].includes(order.id)), false);
    assert.deepEqual((await pedidos(tableA.id)).map((order) => order.id).sort(), [firstB.id, secondB.id].sort());
    assert.equal((await pedidos()).some((order) => [rogueA.id, rogueNull.id, orderA.id].includes(order.id)), false);
    await db.pedido.update({ where: { id: rogueA.id }, data: { estadoId: cancelledState.id } });
    const nullOnlyRelease = await tableService.update(tableA.id, { estado: "Libre", ...releaseInput }, employee.id);
    const nullOnlyRemove = await tableService.remove(tableA.id, releaseInput);
    assert.ok("error" in nullOnlyRelease && nullOnlyRelease.status === 409);
    assert.ok("error" in nullOnlyRemove && nullOnlyRemove.status === 409);
    assert.equal((await db.mesa.findUniqueOrThrow({ where: { id: tableA.id } })).atencionToken, tokenB);
    assert.equal((await db.pedido.findUniqueOrThrow({ where: { id: rogueNull.id } })).estadoId, activeState.id);
    assert.equal((await db.pedido.findUniqueOrThrow({ where: { id: secondB.id } })).estadoId, activeState.id);

    const emptyTable = await newTable();
    const emptyOrder = await newOrder(emptyTable.id, emptyTable.atencionToken!, employee.id);
    assert.ok("updated" in await orderService.cancelItem(emptyOrder.items[0].id,
      { atencionToken: emptyTable.atencionToken!, motivo: "Cliente canceló" }));
    const emptyReleased = await tableService.update(emptyTable.id, { estado: "Libre",
      revisionEsperada: emptyTable.revision, atencionTokenEsperado: emptyTable.atencionToken }, employee.id);
    assert.ok("mesa" in emptyReleased && emptyReleased.mesa.atencionToken === null);
    assert.equal((await db.pedido.findUniqueOrThrow({ where: { id: emptyOrder.id } })).estadoId, cancelledState.id);
    assert.equal((await consumos(emptyTable.id)).total, 0);

    const evidence = {
      identity, tableId: tableA.id, attentionDistinct: tokenA !== tokenB,
      accountA: { id: accountA.id, total: amountA, historicalDetailCount: 1 },
      attentionB: { orders: [firstB.id, secondB.id], employees: 2, activeTotal: current.total,
        cancelledItemExcluded: true },
      inconsistentHistory: { foreignActiveOrderId: rogueA.id, nullTokenOrderId: rogueNull.id,
        visibleInCurrentConsumption: false, foreignOnlyReleaseStatus: 409, foreignOnlyRemoveStatus: 409,
        nullOnlyReleaseStatus: 409, nullOnlyRemoveStatus: 409, activeOrderApisIsolated: true,
        currentOrdersUnchanged: true },
      emptyOrder: { orderId: emptyOrder.id, releaseSucceeded: true, state: CODES.pedido.anulado },
      result: "APROBADA"
    };
    await writeFile("tests/evidence/active-consumption-attention-20261028.json", JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
