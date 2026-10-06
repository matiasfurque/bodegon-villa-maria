import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { json, requirePermission, requireSession } from "@/lib/api";
import { CODES, mesaEstadoBy, sectorMesaBy } from "@/lib/normalized";
import { prisma } from "@/lib/prisma";

function serializeMesa(mesa: { estado: { nombre: string; codigo: string; permitePedido: boolean; liberaMesa: boolean }; sector?: { nombre: string } | null } & Record<string, unknown>) {
  return {
    ...mesa,
    estado: mesa.estado.nombre,
    estadoCodigo: mesa.estado.codigo,
    estadoPermitePedido: mesa.estado.permitePedido,
    estadoLiberaMesa: mesa.estado.liberaMesa,
    sector: mesa.sector?.nombre || null,
    activa: mesa.estado.codigo !== CODES.mesa.cerrada
  };
}

export async function GET(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const mesas = await prisma.mesa.findMany({ orderBy: { numero: "asc" }, include: { estado: true, sector: true } });
  return json(mesas.map(serializeMesa));
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const data = await request.json();
  const numero = Number(data.numero);
  const capacidad = Number(data.capacidad);
  if (!Number.isInteger(numero) || numero <= 0) {
    return json({ error: "Ingresá un número de mesa válido" }, 400);
  }
  if (!Number.isInteger(capacidad) || capacidad <= 0) {
    return json({ error: "Ingresá una capacidad válida" }, 400);
  }

  const existing = await prisma.mesa.findUnique({ where: { numero }, include: { estado: true, sector: true } });
  if (existing) {
    const sector = await sectorMesaBy(data.descripcion || existing.descripcion);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${existing.id} FOR UPDATE`;
      const current = await tx.mesa.findUniqueOrThrow({ where: { id: existing.id }, include: { estado: true } });
      const estado = existing.estado.codigo === CODES.mesa.cerrada && current.estado.codigo === CODES.mesa.cerrada
        ? await tx.mesaEstado.findUniqueOrThrow({ where: { codigo: CODES.mesa.libre } })
        : current.estado;
      if (estado.codigo === CODES.mesa.libre) {
        const activePedidos = await tx.pedido.count({ where: { mesaId: current.id, estado: { esActivo: true } } });
        if (activePedidos > 0) {
          return { error: "No se puede liberar una mesa con pedidos activos. Cerrá la cuenta para dejarla libre." };
        }
      }
      const mesa = await tx.mesa.update({
        where: { id: current.id },
        data: {
          capacidad,
          descripcion: data.descripcion || existing.descripcion,
          sectorId: sector.id,
          estadoId: estado.id
        },
        include: { estado: true, sector: true }
      });
      return { mesa };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    if ("error" in result) return json({ error: result.error }, 400);
    return json(serializeMesa(result.mesa));
  }

  try {
    const estado = await mesaEstadoBy(data.estado, CODES.mesa.libre);
    const sector = await sectorMesaBy(data.descripcion);
    const mesa = await prisma.mesa.create({
      data: {
        numero,
        capacidad,
        descripcion: data.descripcion || null,
        sectorId: sector.id,
        estadoId: estado.id
      },
      include: { estado: true, sector: true }
    });
    return json(serializeMesa(mesa), 201);
  } catch {
    return json({ error: "No se pudo crear la mesa. Revisá que el número no exista." }, 400);
  }
}
