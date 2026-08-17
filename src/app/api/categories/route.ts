import { NextRequest } from "next/server";
import { asBool, json, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  return json(await prisma.categoriaProducto.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] }));
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;
  const data = await request.json();
  if (!data.nombre) return json({ error: "El nombre es obligatorio" }, 400);
  const categoria = await prisma.categoriaProducto.create({
    data: { nombre: data.nombre, orden: Number(data.orden || 0), visible: asBool(data.visible ?? true) }
  });
  return json(categoria, 201);
}
