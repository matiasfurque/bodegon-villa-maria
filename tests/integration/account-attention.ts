import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { CODES } from "../../src/lib/normalized";
import { tableService } from "../../src/modules/tables/table.service";
import { orderService } from "../../src/modules/orders/order.service";
import { accountService, CloseAccountError } from "../../src/modules/accounts/account.service";

const target = new URL(process.env.DATABASE_URL || "");
if (target.hostname !== "127.0.0.1" || target.port !== "55432" ||
    target.pathname !== "/bvm_attention_race_20261027" || target.username !== "bvm_test") {
  throw new Error("Solo se admite bvm_test@127.0.0.1:55432/bvm_attention_race_20261027");
}

async function expectConflict(action: () => Promise<unknown>) {
  await assert.rejects(action, (error: unknown) => error instanceof CloseAccountError && error.status === 409);
}

function expectOrderConflict(result: { error?: string; status?: number }) {
  assert.equal(result.status, 409, JSON.stringify(result));
}

async function main() {
  const db = new PrismaClient();
  const checks: string[] = [];
  try {
    const [identity] = await db.$queryRaw<Array<{ username: string; database: string; host: string; port: number }>>`
      SELECT current_user AS username, current_database() AS database,
        host(inet_server_addr()) AS host, inet_server_port() AS port
    `;
    assert.deepEqual(identity, {
      username: "bvm_test", database: "bvm_attention_race_20261027", host: "127.0.0.1", port: 55432
    });
    checks.push("destino-local-verificado");

    const employee = await db.user.findUniqueOrThrow({ where: { usuario: "empleado" } });
    const product = await db.producto.findFirstOrThrow({ where: { estado: { permiteVenta: true } } });
    const metodo = await db.metodoPago.findFirstOrThrow({ where: { codigo: CODES.pago.efectivo } });
    const cerrada = await db.cuentaEstado.findUniqueOrThrow({ where: { codigo: CODES.cuenta.cerrada } });
    const active = await db.pedidoEstado.findUniqueOrThrow({ where: { codigo: CODES.pedido.activo } });
    const annulled = await db.pedidoEstado.findUniqueOrThrow({ where: { codigo: CODES.pedido.anulado } });
    const delivered = await db.pedidoEstadoCocina.findUniqueOrThrow({ where: { codigo: CODES.cocina.entregado } });
    const pending = await db.pedidoEstadoCocina.findUniqueOrThrow({ where: { codigo: CODES.cocina.pendiente } });
    const historicalMesa = await db.mesa.findFirstOrThrow();
    const historicIds = await Promise.all([0, 1].map(async () => (await db.cuenta.create({ data: {
      mesaId: historicalMesa.id, usuarioCierreId: employee.id, atencionToken: null,
      total: 0, metodoPagoId: metodo.id, montoRecibido: 0, vuelto: 0, estadoId: cerrada.id
    } })).id));
    checks.push("dos-cuentas-historicas-null-coexisten");

    const numero = 99000000 + randomInt(1, 1000000);
    const created = await tableService.create({ numero, capacidad: 4, descripcion: "Cuenta aislada" });
    if (!("mesa" in created) || !created.mesa) throw new Error("No se creó la mesa de prueba");
    const mesaId = created.mesa.id;
    const occupied = await tableService.update(mesaId, {
      estado: "Ocupada", revisionEsperada: created.mesa.revision,
      atencionTokenEsperado: created.mesa.atencionToken
    }, employee.id);
    assert.ok("mesa" in occupied);
    const tokenA = occupied.mesa.atencionToken;
    assert.ok(tokenA);
    const revisionA = occupied.mesa.revision;
    checks.push("mesa-a-ocupada-con-uuid");

    const first = await orderService.create({ mesaId, usuarioId: employee.id, atencionToken: tokenA, solicitudId: randomUUID(),
      items: [{ productoId: product.id, cantidad: 2 }] });
    assert.ok("pedido" in first && first.pedido);
    const pedidoA = first.pedido.id;
    const added = await orderService.addItem(pedidoA, { productoId: product.id, cantidad: 1, atencionToken: tokenA, solicitudId: randomUUID() });
    assert.ok("item" in added && added.item);
    const originalPrice = Number(product.precio);
    const newPrice = originalPrice + 111;
    await db.producto.update({ where: { id: product.id }, data: { precio: newPrice } });
    try {
      let expected: string = CODES.cocina.pendiente;
      for (const next of [CODES.cocina.enPreparacion, CODES.cocina.listo, CODES.cocina.entregado]) {
        const result = await orderService.update(pedidoA, { estadoCocina: next, estadoCocinaEsperado: expected,
          atencionToken: tokenA,
          ...(next === CODES.cocina.listo ? { revisionContenidoEsperada: (await db.pedido.findUniqueOrThrow({ where: { id: pedidoA } })).revisionContenido } : {}) });
        assert.ok("updated" in result);
        expected = next;
      }
      checks.push("pedido-a-productos-cocina-entregado");

      const closeInput = { mesaId, atencionToken: tokenA, usuarioCierreId: employee.id, montoRecibido: originalPrice * 3 };
      await assert.rejects(() => accountService.close({ ...closeInput, atencionToken: undefined }),
        (error: unknown) => error instanceof CloseAccountError && error.status === 400);
      await assert.rejects(() => accountService.close({ ...closeInput, atencionToken: "mal-formato" }),
        (error: unknown) => error instanceof CloseAccountError && error.status === 400);
      await expectConflict(() => accountService.close({ ...closeInput, atencionToken: randomUUID() }));
      assert.equal(await db.cuenta.count({ where: { mesaId, atencionToken: tokenA } }), 0);
      checks.push("faltante-invalido-antiguo-sin-escrituras");

      const foreign = await db.pedido.create({ data: {
        mesaId, usuarioId: employee.id, atencionToken: randomUUID(),
        estadoId: active.id, estadoCocinaId: delivered.id
      } });
      await expectConflict(() => accountService.close(closeInput));
      assert.equal(await db.cuenta.count({ where: { mesaId, atencionToken: tokenA } }), 0);
      await db.pedido.update({ where: { id: foreign.id }, data: { estadoId: annulled.id } });
      checks.push("pedido-de-otra-atencion-rechazado");

      await assert.rejects(() => accountService.close({ ...closeInput, usuarioCierreId: -999999 }),
        (error: unknown) => error instanceof Error);
      const afterRollback = await db.mesa.findUniqueOrThrow({ where: { id: mesaId } });
      assert.equal(afterRollback.atencionToken, tokenA);
      assert.equal(afterRollback.revision, revisionA);
      assert.equal((await db.pedido.findUniqueOrThrow({ where: { id: pedidoA }, include: { estado: true } })).estado.esActivo, true);
      assert.equal(await db.cuenta.count({ where: { mesaId, atencionToken: tokenA } }), 0);
      checks.push("rollback-completo-tras-fallo-de-cuenta");

      const outcomes = await Promise.allSettled([accountService.close(closeInput), accountService.close(closeInput)]);
      assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
      assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
      assert.equal(await db.cuenta.count({ where: { mesaId, atencionToken: tokenA } }), 1);
      const accountA = await db.cuenta.findUniqueOrThrow({ where: { atencionToken: tokenA }, include: { detalles: true } });
      assert.equal(Number(accountA.total), originalPrice * 3);
      assert.equal(accountA.detalles.length, 2);
      assert.ok(accountA.detalles.every((detail) => Number(detail.precioUnitario) === originalPrice));
      assert.equal(accountA.detalles.reduce((sum, detail) => sum + Number(detail.subtotal), 0), originalPrice * 3);
      const closedA = await db.mesa.findUniqueOrThrow({ where: { id: mesaId }, include: { estado: true } });
      assert.equal(closedA.estado.codigo, CODES.mesa.libre);
      assert.equal(closedA.atencionToken, null);
      assert.equal(closedA.revision, revisionA + 1);
      assert.equal((await db.pedido.findUniqueOrThrow({ where: { id: pedidoA }, include: { estado: true } })).estado.esActivo, false);
      checks.push("doble-cierre-unico-cuenta-detalles-precios-revision");

      const reopened = await tableService.update(mesaId, {
        estado: "Ocupada", revisionEsperada: closedA.revision, atencionTokenEsperado: null
      }, employee.id);
      assert.ok("mesa" in reopened);
      const tokenB = reopened.mesa.atencionToken;
      assert.ok(tokenB && tokenB !== tokenA);
      const second = await orderService.create({ mesaId, usuarioId: employee.id, atencionToken: tokenB, solicitudId: randomUUID(),
        items: [{ productoId: product.id, cantidad: 1 }] });
      assert.ok("pedido" in second && second.pedido);
      const pedidoB = second.pedido.id;
      expectOrderConflict(await orderService.create({ mesaId, usuarioId: employee.id, atencionToken: tokenA, solicitudId: randomUUID(),
        items: [{ productoId: product.id, cantidad: 1 }] }));
      await expectConflict(() => accountService.close(closeInput));
      expectOrderConflict(await orderService.addItem(pedidoA, { productoId: product.id, atencionToken: tokenA, solicitudId: randomUUID() }));
      expectOrderConflict(await orderService.cancelItem(first.pedido.items[0].id, { motivo: "Antiguo", atencionToken: tokenA }));
      expectOrderConflict(await orderService.update(pedidoA, { observacion: "Antigua", atencionToken: tokenA }));
      const currentB = await db.mesa.findUniqueOrThrow({ where: { id: mesaId } });
      assert.equal(currentB.atencionToken, tokenB);
      assert.equal(currentB.revision, revisionA + 2);
      assert.equal(await db.cuenta.count({ where: { mesaId } }), 1);
      assert.equal((await db.pedido.findUniqueOrThrow({ where: { id: pedidoB } })).atencionToken, tokenB);
      assert.equal((await db.cuenta.findUniqueOrThrow({ where: { id: accountA.id } })).atencionToken, tokenA);
      checks.push("atencion-b-aislada-de-operaciones-a-antiguas");

      assert.equal(await db.cuenta.count({ where: { id: { in: historicIds }, atencionToken: null } }), 2);
      const history = await accountService.list({ hasDateFilter: false, mesaId });
      assert.ok(history.some((account) => account.id === accountA.id));
      checks.push("historial-actual-e-historico-preservado");

      const evidence = { target: identity, mesaId, pedidoA, pedidoB, cuentaA: accountA.id,
        revisionA, revisionCierre: closedA.revision, revisionB: currentB.revision,
        checks, result: "APROBADA" };
      await writeFile("tests/evidence/account-attention-20261028.json", JSON.stringify(evidence, null, 2));
      console.log(JSON.stringify(evidence, null, 2));
    } finally {
      await db.producto.update({ where: { id: product.id }, data: { precio: originalPrice } });
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
