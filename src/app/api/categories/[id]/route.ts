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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "productos.gestionar");
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json();
  const estado = await categoriaEstadoBy(data.visible);
  const categoria = await prisma.categoriaProducto.update({
    where: { id: Number(id) },
    data: { nombre: data.nombre, orden: Number(data.orden || 0), estadoId: estado.id },
    include: { estado: true }
  });
  return json(serializeCategoria(categoria));
}
