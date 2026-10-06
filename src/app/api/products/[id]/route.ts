import { NextRequest } from "next/server";
import { json, requirePermission } from "@/lib/api";
import { productoEstadoBy, productoVisibilidadBy } from "@/lib/normalized";
import { prisma } from "@/lib/prisma";

function serializeProducto(producto: {
  estado: { nombre: string; codigo: string; permiteVenta: boolean };
  visibilidad: { nombre: string; codigo: string; visibleEnMenu: boolean };
} & Record<string, unknown>) {
  return {
    ...producto,
    activo: producto.estado.permiteVenta,
    visibleMenu: producto.visibilidad.visibleEnMenu,
    estadoNombre: producto.estado.nombre,
    estadoCodigo: producto.estado.codigo,
    visibilidadNombre: producto.visibilidad.nombre,
    visibilidadCodigo: producto.visibilidad.codigo
  };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "productos.gestionar");
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
  const estado = await productoEstadoBy(data.activo);
  const visibilidad = await productoVisibilidadBy(data.visibleMenu);
  const product = await prisma.producto.update({
    where: { id: productId },
    data: {
      nombre,
      descripcion: data.descripcion || null,
      precio,
      estadoId: estado.id,
      visibilidadId: visibilidad.id,
      categoriaId: Number(data.categoriaId)
    },
    include: { categoria: true, estado: true, visibilidad: true }
  });
  return json(serializeProducto(product));
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "productos.gestionar");
  if (auth.error) return auth.error;
  const { id } = await params;
  const productId = Number(id);
  const itemCount = await prisma.pedidoItem.count({ where: { productoId: productId } });

  if (itemCount > 0) {
    const estado = await productoEstadoBy(false);
    const visibilidad = await productoVisibilidadBy(false);
    const product = await prisma.producto.update({
      where: { id: productId },
      data: { estadoId: estado.id, visibilidadId: visibilidad.id },
      include: { categoria: true, estado: true, visibilidad: true }
    });
    return json({
      ...serializeProducto(product),
      deletedMode: "logical",
      message: "El producto tiene historial, por eso fue inactivado y ocultado del menú."
    });
  }

  await prisma.producto.delete({ where: { id: productId } });
  return json({ ok: true, deletedMode: "physical" });
}
