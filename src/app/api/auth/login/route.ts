import { NextRequest } from "next/server";
import { createSessionCookie, setSession } from "@/lib/auth";
import { json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

export async function POST(request: NextRequest) {
  const { usuario, password } = await request.json();
  if (!usuario || !password) return json({ error: "Completá usuario y contraseña" }, 400);

  const user = await prisma.user.findUnique({
    where: { usuario },
    include: { role: true }
  });

  if (!user || !user.estado || !verifyPassword(password, user.passwordHash)) {
    return json({ error: "Credenciales inválidas" }, 401);
  }

  await setSession(createSessionCookie(user));
  return json({
    user: {
      id: user.id,
      nombre: user.nombre,
      apellido: user.apellido,
      usuario: user.usuario,
      role: user.role.nombre
    }
  });
}
