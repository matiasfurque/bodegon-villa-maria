import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { CODES } from "../../src/lib/normalized";
import { orderService } from "../../src/modules/orders/order.service";

const target = new URL(process.env.DATABASE_URL || "");
if (target.hostname !== "127.0.0.1" || target.port !== "55432" ||
    target.pathname !== "/bvm_account_result_20261028" || target.username !== "bvm_test") {
  throw new Error("Solo se admite la base local descartable bvm_account_result_20261028");
}

async function main() {
  const db = new PrismaClient();
  try {
    const [identity] = await db.$queryRaw<Array<{ username: string; database: string; host: string; port: number }>>`
      SELECT current_user AS username, current_database() AS database,
        host(inet_server_addr()) AS host, inet_server_port() AS port
    `;
    assert.deepEqual(identity, { username: "bvm_test", database: "bvm_account_result_20261028", host: "127.0.0.1", port: 55432 });
    const mesa = await db.mesa.findFirstOrThrow({ where: { descripcion: "Prueba resultado", atencionToken: { not: null } } });
    assert.ok(mesa.atencionToken);
    const employee = await db.user.findUniqueOrThrow({ where: { usuario: "empleado" } });
    const product = await db.producto.findFirstOrThrow({ where: { estado: { permiteVenta: true } } });
    const created = await orderService.create({ mesaId: mesa.id, usuarioId: employee.id, atencionToken: mesa.atencionToken,
      solicitudId: randomUUID(), items: [{ productoId: product.id, cantidad: 1 }] });
    assert.ok("pedido" in created && created.pedido);
    let expected: string = CODES.cocina.pendiente;
    for (const next of [CODES.cocina.enPreparacion, CODES.cocina.listo, CODES.cocina.entregado]) {
      const changed = await orderService.update(created.pedido.id,
        { estadoCocina: next, estadoCocinaEsperado: expected, atencionToken: mesa.atencionToken,
          ...(next === CODES.cocina.listo ? { revisionContenidoEsperada: (await db.pedido.findUniqueOrThrow({ where: { id: created.pedido.id } })).revisionContenido } : {}) });
      assert.ok("updated" in changed);
      expected = next;
    }
    console.log(JSON.stringify({ target: identity, mesaId: mesa.id, mesaNumero: mesa.numero,
      token: mesa.atencionToken, pedidoId: created.pedido.id, total: Number(product.precio) }));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
