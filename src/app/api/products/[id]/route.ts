import { NextRequest } from "next/server";
import { asBool, json, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json();
  const productId = Number(id);
  const nombre = String(data.nombre || "").trim();
  const precio = Number(data.precio);
  if (!nombre || !data.categoriaId) return json({ error: "Nombre, precio y categoría son obligatorios" }, 400);
  if (!Number.isFinite(precio) || precio <= 0) return json({ error: "El precio debe ser mayor a cero" }, 400);
  const existing = await prisma.producto.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" }, NOT: { id: productId } }
  });
  if (existing) return json({ error: "Ya existe un producto con ese nombre" }, 400);
  const product = await prisma.producto.update({
    where: { id: productId },
    data: {
      nombre,
      descripcion: data.descripcion || null,
      precio,
      activo: asBool(data.activo),
      visibleMenu: asBool(data.visibleMenu),
      categoriaId: Number(data.categoriaId)
    },
    include: { categoria: true }
  });
  return json(product);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const productId = Number(id);
  const itemCount = await prisma.pedidoItem.count({ where: { productoId: productId } });

  if (itemCount > 0) {
    const product = await prisma.producto.update({
      where: { id: productId },
      data: { activo: false, visibleMenu: false },
      include: { categoria: true }
    });
    return json({
      ...product,
      deletedMode: "logical",
      message: "El producto tiene historial, por eso fue inactivado y ocultado del menú."
    });
  }

  await prisma.producto.delete({ where: { id: productId } });
  return json({ ok: true, deletedMode: "physical" });
}
