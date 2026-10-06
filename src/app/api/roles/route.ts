import { NextRequest } from "next/server";
import { requirePermission, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "usuarios.gestionar");
  if (auth.error) return auth.error;
  return json(await prisma.role.findMany({ orderBy: { nombre: "asc" }, include: { permisos: { include: { permiso: true } } } }));
}
