import { NextRequest } from "next/server";
import { json, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json().catch(() => ({}));
  const item = await prisma.pedidoItem.findUnique({
    where: { id: Number(id) },
    include: { pedido: { include: { mesa: true } } }
  });
  if (!item || item.pedido.estado !== "Activo" || item.pedido.mesa.estado !== "Ocupada") {
    return json({ error: "El item no puede anularse" }, 400);
  }
  const updated = await prisma.pedidoItem.update({
    where: { id: Number(id) },
    data: { anulado: true, motivoAnulacion: data.motivo || "Anulado por usuario" },
    include: { producto: true }
  });
  return json(updated);
}
