import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { CODES } from "../../src/lib/normalized";
import { tableService } from "../../src/modules/tables/table.service";
import { orderService } from "../../src/modules/orders/order.service";
import { accountService } from "../../src/modules/accounts/account.service";

const target = new URL(process.env.DATABASE_URL || "");
if (target.hostname !== "127.0.0.1" || target.port !== "55432" ||
    target.pathname !== "/bvm_account_result_20261028" || target.username !== "bvm_test") {
  throw new Error("Solo se admite bvm_test@127.0.0.1:55432/bvm_account_result_20261028");
}

async function main() {
  const db = new PrismaClient();
  try {
    const [identity] = await db.$queryRaw<Array<{ username: string; database: string; host: string; port: number }>>`
      SELECT current_user AS username, current_database() AS database,
        host(inet_server_addr()) AS host, inet_server_port() AS port
    `;
    assert.deepEqual(identity, { username: "bvm_test", database: "bvm_account_result_20261028", host: "127.0.0.1", port: 55432 });

    const employee = await db.user.findUniqueOrThrow({ where: { usuario: "empleado" } });
    const admin = await db.user.findUniqueOrThrow({ where: { usuario: "admin" } });
    const product = await db.producto.findFirstOrThrow({ where: { estado: { permiteVenta: true } } });
    const result = await tableService.create({ numero: 88000000 + Math.floor(Math.random() * 1000000), capacidad: 2, descripcion: "Prueba resultado" });
    if (!("mesa" in result) || !result.mesa) throw new Error("No se creó la mesa de prueba");
    const occupied = await tableService.update(result.mesa.id,
      { estado: "Ocupada", revisionEsperada: result.mesa.revision, atencionTokenEsperado: null }, employee.id);
    assert.ok("mesa" in occupied && occupied.mesa.atencionToken);
    const tokenA = occupied.mesa.atencionToken;
    const created = await orderService.create({ mesaId: result.mesa.id, usuarioId: employee.id, atencionToken: tokenA,
      solicitudId: randomUUID(), items: [{ productoId: product.id, cantidad: 1 }] });
    assert.ok("pedido" in created && created.pedido);
    let expected: string = CODES.cocina.pendiente;
    for (const next of [CODES.cocina.enPreparacion, CODES.cocina.listo, CODES.cocina.entregado]) {
      const changed = await orderService.update(created.pedido.id,
        { estadoCocina: next, estadoCocinaEsperado: expected, atencionToken: tokenA,
          ...(next === CODES.cocina.listo ? { revisionContenidoEsperada: (await db.pedido.findUniqueOrThrow({ where: { id: created.pedido.id } })).revisionContenido } : {}) });
      assert.ok("updated" in changed);
      expected = next;
    }

    const absent = await accountService.getClosedResult(tokenA, employee.id);
    assert.equal(absent, null);
    const before = await db.cuenta.count({ where: { atencionToken: tokenA } });
    const closed = await accountService.close({ mesaId: result.mesa.id, atencionToken: tokenA,
      usuarioCierreId: employee.id, montoRecibido: Number(product.precio) });
    assert.equal(before, 0);
    // Simula que el navegador pierde la respuesta: descarta `closed` y consulta por el UUID original.
    const recovered = await accountService.getClosedResult(tokenA, employee.id);
    assert.equal(recovered?.id, closed.id);
    assert.equal(recovered?.atencionToken, tokenA);
    assert.equal(Number(recovered?.total), Number(product.precio));
    assert.equal(recovered?.metodoPago.nombre, "Efectivo");
    assert.equal(recovered?.estado.nombre, "Cerrada");
    assert.equal(await accountService.getClosedResult(tokenA, admin.id), null);
    assert.equal(await db.cuenta.count({ where: { atencionToken: tokenA } }), 1);
    const released = await db.mesa.findUniqueOrThrow({ where: { id: result.mesa.id } });
    assert.equal(released.atencionToken, null);
    assert.equal((await accountService.getClosedResult(tokenA, employee.id))?.id, closed.id);

    const reopened = await tableService.update(result.mesa.id,
      { estado: "Ocupada", revisionEsperada: released.revision, atencionTokenEsperado: null }, employee.id);
    assert.ok("mesa" in reopened && reopened.mesa.atencionToken);
    assert.notEqual(reopened.mesa.atencionToken, tokenA);
    assert.equal((await accountService.getClosedResult(tokenA, employee.id))?.id, closed.id);
    assert.equal(await accountService.getClosedResult(reopened.mesa.atencionToken, employee.id), null);
    assert.equal(await db.cuenta.count({ where: { atencionToken: tokenA } }), 1);

    const history = await accountService.list({ hasDateFilter: false, mesaId: result.mesa.id });
    assert.ok(history.some((account) => account.id === closed.id));
    const method = await db.metodoPago.findFirstOrThrow({ where: { codigo: CODES.pago.efectivo } });
    const state = await db.cuentaEstado.findUniqueOrThrow({ where: { codigo: CODES.cuenta.cerrada } });
    const historical = await db.cuenta.create({ data: { mesaId: result.mesa.id, usuarioCierreId: employee.id,
      atencionToken: null, total: 0, metodoPagoId: method.id, montoRecibido: 0, vuelto: 0, estadoId: state.id } });
    assert.equal((await accountService.list({ hasDateFilter: false, mesaId: result.mesa.id }))
      .some((account) => account.id === historical.id), true);
    assert.equal(await accountService.getClosedResult(reopened.mesa.atencionToken, employee.id), null);
    console.log(JSON.stringify({ target: identity, result: "APROBADA", accountId: closed.id, historicalId: historical.id,
      tokenA, tokenB: reopened.mesa.atencionToken, count: await db.cuenta.count({ where: { atencionToken: tokenA } }),
      checks: ["sin-cierre", "respuesta-descartada-recuperada", "solo-usuario-cierre", "mesa-libre", "mesa-reocupada",
        "consulta-no-crea-cuenta", "historial-conservado", "historica-null"] }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
