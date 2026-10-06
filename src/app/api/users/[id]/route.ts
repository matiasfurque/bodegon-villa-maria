import { NextRequest } from "next/server";
import { json, requirePermission } from "@/lib/api";
import { CODES, usuarioEstadoBy } from "@/lib/normalized";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { prisma } from "@/lib/prisma";

function serializeUser(user: {
  estado: { nombre: string; codigo: string; permiteAcceso: boolean };
} & Record<string, unknown>) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return {
    ...safeUser,
    estado: user.estado.permiteAcceso,
    estadoNombre: user.estado.nombre,
    estadoCodigo: user.estado.codigo
  };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "usuarios.gestionar");
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
  const estado = await usuarioEstadoBy(data.estado);
  const update: Record<string, unknown> = {
    nombre,
    apellido,
    usuario,
    telefono: String(data.telefono || "").trim() || null,
    email: email || null,
    estadoId: estado.id,
    roleId: Number(data.roleId)
  };
  if (data.password) {
    const strengthError = validatePasswordStrength(String(data.password));
    if (strengthError) return json({ error: strengthError }, 400);
    update.passwordHash = hashPassword(data.password);
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: update,
    include: { role: true, estado: true }
  });
  return json(serializeUser(user));
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "usuarios.gestionar");
  if (auth.error) return auth.error;
  const { id } = await params;
  const userId = Number(id);
  if (auth.session?.userId === userId) {
    return json({ error: "No podés darte de baja a vos mismo" }, 400);
  }
  const inactivo = await usuarioEstadoBy(CODES.usuario.inactivo);
  const user = await prisma.user.update({
    where: { id: userId },
    data: { estadoId: inactivo.id },
    include: { role: true, estado: true }
  });
  return json(serializeUser(user));
}
