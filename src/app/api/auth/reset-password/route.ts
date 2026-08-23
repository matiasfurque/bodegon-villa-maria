import { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { hashPasswordResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const data = await request.json().catch(() => ({}));
  const token = String(data.token || "").trim();
  const password = String(data.password || "");
  const confirmPassword = String(data.confirmPassword || "");

  if (!token || !password || !confirmPassword) {
    return json({ error: "Completá la nueva contraseña y su confirmación" }, 400);
  }
  if (password !== confirmPassword) {
    return json({ error: "La confirmación no coincide con la nueva contraseña" }, 400);
  }
  const strengthError = validatePasswordStrength(password);
  if (strengthError) return json({ error: strengthError }, 400);

  const tokenHash = hashPasswordResetToken(token);
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, estado: true } } }
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date() || !resetToken.user.estado) {
    return json({ error: "El enlace de recuperación no es válido o ya venció" }, 400);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: hashPassword(password) }
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() }
    })
  ]);

  return json({ ok: true });
}
