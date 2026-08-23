import { NextRequest } from "next/server";
import { json } from "@/lib/api";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  passwordResetExpiration,
  sendPasswordResetEmail
} from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";

function maskEmail(email: string) {
  const visible = email.slice(0, 3);
  const hiddenLength = Math.max(6, email.length - visible.length);
  return `${visible}${"*".repeat(hiddenLength)}`;
}

function sentMessage(email: string) {
  return `Enviamos un correo con las instrucciones para recuperar la contraseña al correo ${maskEmail(email)}.`;
}

function resetUrlFromRequest(request: NextRequest, token: string) {
  const configuredUrl = process.env.APP_URL;
  const origin = configuredUrl || request.nextUrl.origin;
  return `${origin}/restablecer-contrasena?token=${encodeURIComponent(token)}`;
}

export async function POST(request: NextRequest) {
  const data = await request.json().catch(() => ({}));
  const identifier = String(data.identifier || "").trim();

  if (!identifier) return json({ error: "Ingresá un usuario o email" }, 400);

  const user = await prisma.user.findFirst({
    where: {
      estado: true,
      OR: [
        { usuario: { equals: identifier, mode: "insensitive" } },
        { email: { equals: identifier, mode: "insensitive" } }
      ]
    },
    select: { id: true, email: true }
  });

  if (!user) {
    return json({ error: "No existe un usuario activo con esos datos" }, 404);
  }

  if (!user.email) {
    return json({ error: "Ese usuario no tiene un email cargado para recuperar la contraseña" }, 400);
  }

  const token = createPasswordResetToken();
  const resetUrl = resetUrlFromRequest(request, token);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashPasswordResetToken(token),
      expiresAt: passwordResetExpiration()
    }
  });

  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production") {
    return json({
      message: sentMessage(user.email),
      resetUrl
    });
  }

  try {
    await sendPasswordResetEmail(user.email, resetUrl);
  } catch (error) {
    await prisma.passwordResetToken.updateMany({
      where: { tokenHash: hashPasswordResetToken(token), usedAt: null },
      data: { usedAt: new Date() }
    });
    console.error("Password reset email error", error);
    return json({ error: "No se pudo enviar el email de recuperación. Revisá la configuración de correo." }, 500);
  }

  return json({ message: sentMessage(user.email) });
}
