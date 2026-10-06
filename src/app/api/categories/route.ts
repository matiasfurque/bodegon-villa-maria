import { NextRequest } from "next/server";
import { json, requirePermission } from "@/lib/api";
import { categoriaEstadoBy } from "@/lib/normalized";
import { prisma } from "@/lib/prisma";

function serializeCategoria(categoria: {
  estado: { nombre: string; codigo: string; visibleEnMenu: boolean; habilitado: boolean };
} & Record<string, unknown>) {
  return {
    ...categoria,
    visible: categoria.estado.visibleEnMenu,
    estadoNombre: categoria.estado.nombre,
    estadoCodigo: categoria.estado.codigo
  };
}

export async function GET() {
  const categorias = await prisma.categoriaProducto.findMany({
    orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    include: { estado: true }
  });
  return json(categorias.map(serializeCategoria));
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "productos.gestionar");
  if (auth.error) return auth.error;
  const data = await request.json();
  if (!data.nombre) return json({ error: "El nombre es obligatorio" }, 400);
  const estado = await categoriaEstadoBy(data.visible ?? true);
  const categoria = await prisma.categoriaProducto.create({
    data: { nombre: data.nombre, orden: Number(data.orden || 0), estadoId: estado.id },
    include: { estado: true }
  });
  return json(serializeCategoria(categoria), 201);
}
