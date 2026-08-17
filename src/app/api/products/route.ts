import { NextRequest } from "next/server";
import { asBool, json, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const products = await prisma.producto.findMany({
    orderBy: { nombre: "asc" },
    include: { categoria: true }
  });
  return json(products);
}

export async function POST(request: NextRequest) {
  const auth = requireSession(request);
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
  const product = await prisma.producto.create({
    data: {
      nombre,
      descripcion: data.descripcion || null,
      precio,
      activo: asBool(data.activo ?? true),
      visibleMenu: asBool(data.visibleMenu ?? true),
      categoriaId: Number(data.categoriaId)
    },
    include: { categoria: true }
  });
  return json(product, 201);
}
