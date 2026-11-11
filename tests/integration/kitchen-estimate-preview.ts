import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { CODES } from "../../src/lib/normalized";
import { tableService } from "../../src/modules/tables/table.service";
import { orderService } from "../../src/modules/orders/order.service";

const target = new URL(process.env.DATABASE_URL || "");
if (target.hostname !== "ep-red-firefly-b66wa6kt.c-2.sa-east-1.aws.neon.tech" ||
    target.pathname !== "/bvm_preview" || target.username !== "bvm_preview_owner") {
  throw new Error("Este ensayo solo puede conectarse al host directo de bvm_preview.");
}

async function main() {
  const db = new PrismaClient();
  const createdOrders: number[] = [];
  let createdTable: number | null = null;
  try {
    const [identity] = await db.$queryRaw<Array<{ database_name: string; role_name: string }>>`
      SELECT current_database() AS database_name, current_user AS role_name`;
    assert.deepEqual(identity, { database_name: "bvm_preview", role_name: "bvm_preview_owner" });
    const employee = await db.user.findUniqueOrThrow({ where: { usuario: "empleado" } });
    const product = await db.producto.findFirstOrThrow({ where: { estado: { permiteVenta: true } } });

    const created = await tableService.create({ numero: 99000000 + randomInt(1, 1000000),
      capacidad: 2, descripcion: "Prueba temporal de temporizador" });
    if (!("mesa" in created) || !created.mesa) throw new Error("No se creó la mesa de prueba.");
    createdTable = created.mesa.id;
    const occupied = await tableService.update(createdTable, { estado: "Ocupada",
      revisionEsperada: created.mesa.revision, atencionTokenEsperado: null }, employee.id);
    if (!("mesa" in occupied) || !occupied.mesa?.atencionToken) throw new Error("No se ocupó la mesa de prueba.");
    const token = occupied.mesa.atencionToken;

    async function newOrder() {
      const result = await orderService.create({ mesaId: createdTable!, usuarioId: employee.id,
        atencionToken: token, solicitudId: randomUUID(), items: [{ productoId: product.id, cantidad: 1 }] });
      if (!("pedido" in result) || !result.pedido) throw new Error("No se creó el pedido de prueba.");
      createdOrders.push(result.pedido.id);
      return result.pedido.id;
    }

    const firstId = await newOrder();
    const started = await orderService.update(firstId, { atencionToken: token,
      estadoCocina: CODES.cocina.enPreparacion, estadoCocinaEsperado: CODES.cocina.pendiente,
      preparacionEstimadaMinutos: 15 });
    assert.ok("updated" in started);
    const firstStored = await db.pedido.findUniqueOrThrow({ where: { id: firstId } });
    assert.equal(firstStored.preparacionEstimadaMinutos, 15);
    assert.ok(firstStored.preparacionIniciadaEn);
    assert.equal(firstStored.preparacionFinalizadaEn, null);

    const edit = (minutes: number) => orderService.update(firstId, { atencionToken: token,
      estadoCocina: CODES.cocina.enPreparacion, estadoCocinaEsperado: CODES.cocina.enPreparacion,
      preparacionEstimadaMinutos: minutes, preparacionEstimadaMinutosEsperados: 15 });
    const edits = await Promise.all([edit(20), edit(30)]);
    assert.equal(edits.filter((result) => "updated" in result).length, 1);
    assert.equal(edits.filter((result) => "error" in result && result.status === 409).length, 1);
    const editedStored = await db.pedido.findUniqueOrThrow({ where: { id: firstId } });
    assert.deepEqual(editedStored.preparacionIniciadaEn, firstStored.preparacionIniciadaEn);
    assert.ok([20, 30].includes(editedStored.preparacionEstimadaMinutos!));

    const ready = await orderService.update(firstId, { atencionToken: token,
      estadoCocina: CODES.cocina.listo, estadoCocinaEsperado: CODES.cocina.enPreparacion,
      revisionContenidoEsperada: 0 });
    assert.ok("updated" in ready);
    const readyStored = await db.pedido.findUniqueOrThrow({ where: { id: firstId } });
    assert.ok(readyStored.preparacionFinalizadaEn);
    assert.ok(readyStored.preparacionFinalizadaEn >= readyStored.preparacionIniciadaEn!);

    const secondId = await newOrder();
    const start = (minutes: number) => orderService.update(secondId, { atencionToken: token,
      estadoCocina: CODES.cocina.enPreparacion, estadoCocinaEsperado: CODES.cocina.pendiente,
      preparacionEstimadaMinutos: minutes });
    const starts = await Promise.all([start(10), start(30)]);
    assert.equal(starts.filter((result) => "updated" in result).length, 1);
    assert.equal(starts.filter((result) => "error" in result && result.status === 409).length, 1);
    const secondStored = await db.pedido.findUniqueOrThrow({ where: { id: secondId } });
    assert.ok([10, 30].includes(secondStored.preparacionEstimadaMinutos!));
    assert.ok(secondStored.preparacionIniciadaEn);

    console.log(JSON.stringify({ database: identity.database_name, persisted: true,
      editRace: "1 accepted, 1 conflict", startRace: "1 accepted, 1 conflict",
      startPreserved: true, finalDurationStored: true, fixtureCount: createdOrders.length }));
  } finally {
    if (createdOrders.length) {
      await db.pedidoItem.deleteMany({ where: { pedidoId: { in: createdOrders } } });
      await db.pedido.deleteMany({ where: { id: { in: createdOrders } } });
    }
    if (createdTable !== null) await db.mesa.delete({ where: { id: createdTable } });
    await db.$disconnect();
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
