import { NextRequest } from "next/server";
import { json, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const mesas = await prisma.mesa.findMany({ orderBy: { numero: "asc" } });
  return json(mesas);
}

export async function POST(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const data = await request.json();
  const numero = Number(data.numero);
  const capacidad = Number(data.capacidad);
  if (!Number.isInteger(numero) || numero <= 0) {
    return json({ error: "Ingresá un número de mesa válido" }, 400);
  }
  if (!Number.isInteger(capacidad) || capacidad <= 0) {
    return json({ error: "Ingresá una capacidad válida" }, 400);
  }

  const existing = await prisma.mesa.findUnique({ where: { numero } });
  if (existing) {
    const mesa = await prisma.mesa.update({
      where: { id: existing.id },
      data: {
        capacidad,
        descripcion: data.descripcion || existing.descripcion,
        activa: true,
        estado: existing.estado === "Cerrada" ? "Libre" : existing.estado
      }
    });
    return json(mesa);
  }

  try {
    const mesa = await prisma.mesa.create({
      data: {
        numero,
        capacidad,
        descripcion: data.descripcion || null,
        estado: data.estado || "Libre"
      }
    });
    return json(mesa, 201);
  } catch {
    return json({ error: "No se pudo crear la mesa. Revisá que el número no exista." }, 400);
  }
}
