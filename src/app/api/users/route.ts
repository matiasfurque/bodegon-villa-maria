import { NextRequest } from "next/server";
import { asBool, json, requireAdmin } from "@/lib/api";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;
  const users = await prisma.user.findMany({
    orderBy: { id: "desc" },
    include: { role: true }
  });
  return json(users.map(({ passwordHash: _passwordHash, ...user }) => user));
}

export async function POST(request: NextRequest) {
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;
  const data = await request.json();
  if (!data.nombre || !data.apellido || !data.usuario || !data.password || !data.roleId) {
    return json({ error: "Faltan campos obligatorios" }, 400);
  }
  const nombre = String(data.nombre).trim();
  const apellido = String(data.apellido).trim();
  const usuario = String(data.usuario).trim();
  const email = String(data.email || "").trim();
  if (!nombre || !apellido || !usuario || !String(data.password).trim()) {
    return json({ error: "Faltan campos obligatorios" }, 400);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "El email no tiene un formato válido" }, 400);
  }
  const strengthError = validatePasswordStrength(String(data.password));
  if (strengthError) return json({ error: strengthError }, 400);
  const existing = await prisma.user.findUnique({ where: { usuario } });
  if (existing) return json({ error: "Ya existe un usuario con ese nombre de usuario" }, 400);
  try {
    const user = await prisma.user.create({
      data: {
        nombre,
        apellido,
        usuario,
        passwordHash: hashPassword(data.password),
        telefono: String(data.telefono || "").trim() || null,
        email: email || null,
        estado: asBool(data.estado ?? true),
        roleId: Number(data.roleId)
      },
      include: { role: true }
    });
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return json(safeUser, 201);
  } catch {
    return json({ error: "No se pudo crear el usuario. Revisá que el usuario no exista." }, 400);
  }
}
