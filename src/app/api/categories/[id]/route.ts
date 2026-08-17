import { NextRequest } from "next/server";
import { asBool, json, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json();
  const categoria = await prisma.categoriaProducto.update({
    where: { id: Number(id) },
    data: { nombre: data.nombre, orden: Number(data.orden || 0), visible: asBool(data.visible) }
  });
  return json(categoria);
}
