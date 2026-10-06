import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { json, requireAnyPermission } from "@/lib/api";
import { CODES } from "@/lib/normalized";
import { prisma } from "@/lib/prisma";

const nextKitchenStatus: Record<string, string> = {
  [CODES.cocina.pendiente]: CODES.cocina.enPreparacion,
  [CODES.cocina.enPreparacion]: CODES.cocina.listo,
  [CODES.cocina.listo]: CODES.cocina.entregado
};

const includePedido = {
  mesa: { include: { estado: true } },
  usuario: { select: { id: true, nombre: true, apellido: true, usuario: true } },
  estado: true,
  estadoCocina: true,
  items: { include: { producto: true, estado: true, motivoAnulacion: true } }
};

function serializeMesa(mesa: { estado: { nombre: string; codigo: string; permitePedido: boolean; liberaMesa: boolean } } & Record<string, unknown>) {
  return {
    ...mesa,
    estado: mesa.estado.nombre,
    estadoCodigo: mesa.estado.codigo,
    estadoPermitePedido: mesa.estado.permitePedido,
    estadoLiberaMesa: mesa.estado.liberaMesa
  };
}

function serializePedido(pedido: { estado: { nombre: string; codigo: string; esActivo: boolean }; estadoCocina: { nombre: string; codigo: string; permiteAgregarItems: boolean; visibleCocina: boolean; notificaMozo: boolean }; mesa?: ({ estado: { nombre: string; codigo: string; permitePedido: boolean; liberaMesa: boolean } } & Record<string, unknown>) | null } & Record<string, unknown>) {
  const items = Array.isArray(pedido.items)
    ? (pedido.items as Array<Record<string, any>>).map((item) => ({
        ...item,
        anulado: Boolean(item.estado?.esAnulado),
        motivoAnulacion: item.motivoAnulacion?.nombre || item.motivoAnulacionDetalle || null
      }))
    : pedido.items;
  return {
    ...pedido,
    estado: pedido.estado.nombre,
    estadoCodigo: pedido.estado.codigo,
    estadoActivo: pedido.estado.esActivo,
    estadoCocina: pedido.estadoCocina.nombre,
    estadoCocinaCodigo: pedido.estadoCocina.codigo,
    estadoCocinaPermiteAgregarItems: pedido.estadoCocina.permiteAgregarItems,
    estadoCocinaVisible: pedido.estadoCocina.visibleCocina,
    estadoCocinaNotificaMozo: pedido.estadoCocina.notificaMozo,
    items,
    mesa: pedido.mesa ? serializeMesa(pedido.mesa) : pedido.mesa
  };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyPermission(request, ["cocina.gestionar", "operaciones.gestionar"]);
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json();
  const pedidoId = Number(id);
  const result = await prisma.$transaction(async (tx) => {
    const lockedMesa = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT m."id" FROM "Mesa" m
      JOIN "Pedido" p ON p."mesaId" = m."id"
      WHERE p."id" = ${pedidoId}
      FOR UPDATE OF m
    `;
    await tx.$queryRaw`SELECT "id" FROM "Pedido" WHERE "id" = ${pedidoId} FOR UPDATE`;

    const pedido = await tx.pedido.findUnique({
      where: { id: pedidoId },
      include: { mesa: { include: { estado: true } }, estado: true, estadoCocina: true }
    });
    if (!pedido || pedido.mesaId !== lockedMesa[0]?.id) {
      return { error: "Solo se pueden modificar pedidos activos", status: 400 };
    }

    if (data.estadoCocina) {
      const expectedStatus = String(data.estadoCocinaEsperado || "").trim();
      if (!expectedStatus) return { error: "Indicá el estado de cocina esperado", status: 400 };
      if (expectedStatus !== pedido.estadoCocina.codigo &&
          expectedStatus.toLowerCase() !== pedido.estadoCocina.nombre.toLowerCase()) {
        return {
          error: "El estado del pedido cambió. Actualizá la información e intentá nuevamente.",
          status: 409
        };
      }
    }

    if (!pedido.estado.esActivo || pedido.mesa.estado.codigo !== CODES.mesa.ocupada ||
        !pedido.mesa.estado.permitePedido) {
      return { error: "Solo se pueden modificar pedidos activos", status: 400 };
    }

    const cuentaCerrada = await tx.cuentaDetalle.findFirst({
      where: { pedidoId, cuenta: { estado: { esCerrada: true } } },
      select: { id: true }
    });
    if (cuentaCerrada) return { error: "Solo se pueden modificar pedidos activos", status: 400 };

    const requestedStatus = String(data.estadoCocina || "").trim();
    const estadoCocina = data.estadoCocina
      ? await tx.pedidoEstadoCocina.findFirst({
          where: { OR: [{ codigo: requestedStatus }, { nombre: { equals: requestedStatus, mode: "insensitive" } }] }
        })
      : null;
    if (data.estadoCocina && !estadoCocina) return { error: "Estado de cocina invalido", status: 400 };
    if (estadoCocina && estadoCocina.codigo !== pedido.estadoCocina.codigo &&
        nextKitchenStatus[pedido.estadoCocina.codigo] !== estadoCocina.codigo) {
      return { error: `No se puede pasar de ${pedido.estadoCocina.nombre} a ${estadoCocina.nombre}`, status: 400 };
    }

    const updated = await tx.pedido.update({
      where: { id: pedidoId },
      data: {
        estadoCocinaId: estadoCocina?.id,
        observacion: data.observacion ?? pedido.observacion
      },
      include: includePedido
    });
    return { updated };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  if ("error" in result) return json({ error: result.error }, result.status);
  return json(serializePedido(result.updated));
}
