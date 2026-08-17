import { NextRequest } from "next/server";
import { asBool, json, requireAdmin } from "@/lib/api";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json();
  const userId = Number(id);
  const nombre = String(data.nombre || "").trim();
  const apellido = String(data.apellido || "").trim();
  const usuario = String(data.usuario || "").trim();
  const email = String(data.email || "").trim();
  if (!nombre || !apellido || !usuario || !data.roleId) return json({ error: "Faltan campos obligatorios" }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "El email no tiene un formato válido" }, 400);
  }
  const existing = await prisma.user.findFirst({
    where: { usuario, NOT: { id: userId } }
  });
  if (existing) return json({ error: "Ya existe un usuario con ese nombre de usuario" }, 400);
  const update: Record<string, unknown> = {
    nombre,
    apellido,
    usuario,
    telefono: String(data.telefono || "").trim() || null,
    email: email || null,
    estado: asBool(data.estado),
    roleId: Number(data.roleId)
  };
  if (data.password) update.passwordHash = hashPassword(data.password);
  const user = await prisma.user.update({
    where: { id: userId },
    data: update,
    include: { role: true }
  });
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return json(safeUser);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const userId = Number(id);
  if (auth.session?.userId === userId) {
    return json({ error: "No podés darte de baja a vos mismo" }, 400);
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { estado: false },
    include: { role: true }
  });
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return json(safeUser);
}
