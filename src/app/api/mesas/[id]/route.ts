import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { json, requirePermission } from "@/lib/api";
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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json();
  const mesaId = Number(id);

  const estado = data.estado === undefined ? null : await mesaEstadoBy(data.estado);
  const sector = data.descripcion === undefined ? null : await sectorMesaBy(data.descripcion);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${mesaId} FOR UPDATE`;
    if (estado?.codigo === CODES.mesa.libre || estado?.codigo === CODES.mesa.cerrada) {
      const activePedidos = await tx.pedido.count({ where: { mesaId, estado: { esActivo: true } } });
      if (activePedidos > 0) {
        return {
          error: estado.codigo === CODES.mesa.libre
            ? "No se puede liberar una mesa con pedidos activos. Cerrá la cuenta para dejarla libre."
            : "No se puede dar de baja una mesa con pedidos activos. Cerrá la cuenta antes."
        };
      }
    }

    const mesa = await tx.mesa.update({
      where: { id: mesaId },
      data: {
        numero: data.numero === undefined ? undefined : Number(data.numero),
        capacidad: data.capacidad === undefined ? undefined : Number(data.capacidad),
        descripcion: data.descripcion,
        sectorId: sector?.id,
        estadoId: estado?.id,
        abiertaAt: estado?.codigo === CODES.mesa.ocupada ? new Date() : estado?.codigo === CODES.mesa.libre ? null : undefined,
        abiertaPor: estado?.codigo === CODES.mesa.ocupada ? auth.session?.userId : estado?.codigo === CODES.mesa.libre ? null : undefined
      },
      include: { estado: true, sector: true }
    });
    return { mesa };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  if ("error" in result) return json({ error: result.error }, 400);
  return json(serializeMesa(result.mesa));
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const { id } = await params;
  const cerrada = await mesaEstadoBy(CODES.mesa.cerrada);
  const mesaId = Number(id);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${mesaId} FOR UPDATE`;
    const activePedidos = await tx.pedido.count({ where: { mesaId, estado: { esActivo: true } } });
    if (activePedidos > 0) {
      return { error: "No se puede dar de baja una mesa con pedidos activos. Cerrá la cuenta antes." };
    }
    const mesa = await tx.mesa.update({
      where: { id: mesaId },
      data: { estadoId: cerrada.id },
      include: { estado: true, sector: true }
    });
    return { mesa };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  if ("error" in result) return json({ error: result.error }, 400);
  return json(serializeMesa(result.mesa));
}
