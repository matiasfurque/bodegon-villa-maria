import { NextRequest } from "next/server";
import { json, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const includePedido = {
  mesa: true,
  usuario: { select: { id: true, nombre: true, apellido: true, usuario: true } },
  items: { include: { producto: true } }
};

const cocinaEstados = ["Pendiente", "En preparacion", "Listo", "Entregado"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json();
  const pedido = await prisma.pedido.findUnique({ where: { id: Number(id) }, include: { mesa: true } });
  if (!pedido || pedido.estado !== "Activo" || pedido.mesa.estado === "Cerrada") {
    return json({ error: "Solo se pueden modificar pedidos activos" }, 400);
  }
  if (data.estadoCocina && !cocinaEstados.includes(data.estadoCocina)) {
    return json({ error: "Estado de cocina invalido" }, 400);
  }
  const updated = await prisma.pedido.update({
    where: { id: Number(id) },
    data: {
      estado: data.estado || pedido.estado,
      estadoCocina: data.estadoCocina || pedido.estadoCocina,
      observacion: data.observacion ?? pedido.observacion
    },
    include: includePedido
  });
  return json(updated);
}
