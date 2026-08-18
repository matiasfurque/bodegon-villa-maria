import { NextRequest } from "next/server";
import { clearSession, sessionFromRequest } from "@/lib/auth";
import { json } from "@/lib/api";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  const session = sessionFromRequest(request);
  if (!session) return json({ error: "No autenticado" }, 401);

  const data = await request.json();
  const currentPassword = String(data.currentPassword || "");
  const newPassword = String(data.newPassword || "");
  const confirmPassword = String(data.confirmPassword || "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return json({ error: "Completá contraseña actual, nueva contraseña y confirmación" }, 400);
  }
  if (newPassword !== confirmPassword) {
    return json({ error: "La confirmación no coincide con la nueva contraseña" }, 400);
  }
  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) return json({ error: strengthError }, 400);
  if (currentPassword === newPassword) {
    return json({ error: "La nueva contraseña debe ser distinta a la actual" }, 400);
  }

  const user = await prisma.user.findFirst({
    where: { id: session.userId, estado: true },
    select: { id: true, passwordHash: true }
  });
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return json({ error: "La contraseña actual no es correcta" }, 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(newPassword) }
  });
  await clearSession();
  return json({ ok: true });
}
