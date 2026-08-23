import crypto from "crypto";
import { Resend } from "resend";

export const PASSWORD_RESET_EXPIRATION_MINUTES = 30;

export function createPasswordResetToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function passwordResetExpiration() {
  return new Date(Date.now() + PASSWORD_RESET_EXPIRATION_MINUTES * 60 * 1000);
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Villa Maria <onboarding@resend.dev>";

  if (!apiKey) {
    throw new Error("Falta configurar RESEND_API_KEY");
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to,
    subject: "Recuperar contraseña - Villa Maria",
    html: `
      <div style="font-family: Arial, sans-serif; color: #171412; line-height: 1.5;">
        <h1 style="color: #134e2f;">Recuperar contraseña</h1>
        <p>Recibimos una solicitud para restablecer tu contraseña del sistema Villa Maria.</p>
        <p>El enlace vence en ${PASSWORD_RESET_EXPIRATION_MINUTES} minutos.</p>
        <p>
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 16px; background: #134e2f; color: white; border-radius: 8px; text-decoration: none; font-weight: 700;">
            Restablecer contraseña
          </a>
        </p>
        <p>Si no solicitaste este cambio, podés ignorar este email.</p>
      </div>
    `,
    text: `Recuperar contraseña Villa Maria: ${resetUrl}. El enlace vence en ${PASSWORD_RESET_EXPIRATION_MINUTES} minutos.`
  });
}
