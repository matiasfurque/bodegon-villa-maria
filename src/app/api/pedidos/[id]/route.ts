import { NextRequest } from "next/server";
import { json, requireAnyPermission } from "@/lib/api";
import { CODES, cocinaEstadoBy } from "@/lib/normalized";
import { prisma } from "@/lib/prisma";

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
  const pedido = await prisma.pedido.findUnique({ where: { id: Number(id) }, include: { mesa: { include: { estado: true } }, estado: true, estadoCocina: true } });
  if (!pedido || !pedido.estado.esActivo || pedido.mesa.estado.codigo === CODES.mesa.cerrada) {
    return json({ error: "Solo se pueden modificar pedidos activos" }, 400);
  }
  const estadoCocina = data.estadoCocina ? await cocinaEstadoBy(data.estadoCocina).catch(() => null) : null;
  if (data.estadoCocina && !estadoCocina) {
    return json({ error: "Estado de cocina invalido" }, 400);
  }
  const updated = await prisma.pedido.update({
    where: { id: Number(id) },
    data: {
      estadoCocinaId: estadoCocina?.id,
      observacion: data.observacion ?? pedido.observacion
    },
    include: includePedido
  });
  return json(serializePedido(updated));
}
