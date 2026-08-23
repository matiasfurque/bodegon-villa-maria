import { NextRequest } from "next/server";
import { json, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json();
  const mesaId = Number(id);

  if (data.estado === "Libre") {
    const activePedidos = await prisma.pedido.count({
      where: {
        mesaId,
        estado: "Activo"
      }
    });

    if (activePedidos > 0) {
      return json({ error: "No se puede liberar una mesa con pedidos activos. Cerrá la cuenta para dejarla libre." }, 400);
    }
  }

  const mesa = await prisma.mesa.update({
    where: { id: mesaId },
    data: {
      numero: data.numero === undefined ? undefined : Number(data.numero),
      capacidad: data.capacidad === undefined ? undefined : Number(data.capacidad),
      descripcion: data.descripcion,
      estado: data.estado,
      abiertaAt: data.estado === "Ocupada" ? new Date() : data.estado === "Libre" ? null : undefined,
      abiertaPor: data.estado === "Ocupada" ? auth.session?.userId : data.estado === "Libre" ? null : undefined
    }
  });
  return json(mesa);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const mesa = await prisma.mesa.update({
    where: { id: Number(id) },
    data: { activa: false, estado: "Cerrada" }
  });
  return json(mesa);
}
