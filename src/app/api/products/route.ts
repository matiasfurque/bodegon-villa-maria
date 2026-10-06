import { NextRequest } from "next/server";
import { json, requirePermission, requireSession } from "@/lib/api";
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

export async function GET(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const products = await prisma.producto.findMany({
    orderBy: { nombre: "asc" },
    include: { categoria: true, estado: true, visibilidad: true }
  });
  return json(products.map(serializeProducto));
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "productos.gestionar");
  if (auth.error) return auth.error;
  const data = await request.json();
  if (!data.nombre || data.precio === undefined || !data.categoriaId) {
    return json({ error: "Nombre, precio y categoría son obligatorios" }, 400);
  }
  const nombre = String(data.nombre).trim();
  const precio = Number(data.precio);
  if (!nombre) return json({ error: "El nombre es obligatorio" }, 400);
  if (!Number.isFinite(precio) || precio <= 0) return json({ error: "El precio debe ser mayor a cero" }, 400);
  const existing = await prisma.producto.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" } }
  });
  if (existing) return json({ error: "Ya existe un producto con ese nombre" }, 400);
  const estado = await productoEstadoBy(data.activo ?? true);
  const visibilidad = await productoVisibilidadBy(data.visibleMenu ?? true);
  const product = await prisma.producto.create({
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
  return json(serializeProducto(product), 201);
}
