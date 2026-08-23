"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

export default function RestablecerContrasenaPage() {
  return (
    <Suspense fallback={<ResetShell message="Preparando formulario..." />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, confirmPassword })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "No se pudo restablecer la contraseña");
      return;
    }
    setMessage("Contraseña actualizada. Redirigiendo al login...");
    setPassword("");
    setConfirmPassword("");
    setTimeout(() => {
      router.push("/login?passwordReset=1");
    }, 900);
  }

  if (!token) {
    return <ResetShell message="El enlace no incluye un token de recuperación válido." error />;
  }

  return (
    <main className="login-wrap">
      <form className="login-card auth-card" onSubmit={submit}>
        <span className="auth-eyebrow">Enlace temporal</span>
        <h1>Nueva contraseña</h1>
        <p className="muted">Elegí una clave nueva para volver a ingresar al sistema. El enlace se puede usar una sola vez.</p>
        <div className="field">
          <label>Nueva contraseña</label>
          <input autoComplete="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        <div className="field">
          <label>Confirmar contraseña</label>
          <input autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </div>
        <p className="password-hint">Mínimo 8 caracteres, con letras y números.</p>
        {message && <p className="auth-message notice">{message}</p>}
        {error && <p className="auth-message error">{error}</p>}
        <div className="login-actions">
          <button className="btn primary" type="submit" disabled={loading || password.length < 8 || !confirmPassword}>
            {loading ? "Guardando..." : "Guardar contraseña"}
          </button>
          <Link className="muted" href="/login">
            Ir al login
          </Link>
        </div>
      </form>
    </main>
  );
}

function ResetShell({ message, error = false }: { message: string; error?: boolean }) {
  return (
    <main className="login-wrap">
      <section className="login-card auth-card">
        <span className="auth-eyebrow">Enlace temporal</span>
        <h1>Nueva contraseña</h1>
        <p className={error ? "auth-message error" : "muted"}>{message}</p>
        <div className="login-actions">
          <Link className="muted" href="/login">
            Volver al login
          </Link>
        </div>
      </section>
    </main>
  );
}
