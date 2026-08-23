"use client";

import Link from "next/link";
import { useState } from "react";

export default function RecuperarContrasenaPage() {
  const [identifier, setIdentifier] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    setResetUrl("");
    setSent(false);

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "No se pudo enviar la recuperación");
      return;
    }
    setMessage(data.message || "Revisá tu correo para continuar.");
    setResetUrl(data.resetUrl || "");
    setSent(true);
    setIdentifier("");
  }

  return (
    <main className="login-wrap">
      <form className="login-card auth-card" onSubmit={submit}>
        <span className="auth-eyebrow">Acceso interno</span>
        <h1>Recuperar contraseña</h1>
        {!sent && (
          <>
            <p className="muted">Ingresá tu usuario o email para recibir un enlace temporal y crear una nueva contraseña.</p>
            <div className="field">
              <label>Usuario o email</label>
              <input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
            </div>
          </>
        )}
        {message && <p className="auth-message notice">{message}</p>}
        {resetUrl && (
          <a className="btn primary reset-test-link" href={resetUrl}>
            Abrir enlace de prueba
          </a>
        )}
        {error && <p className="auth-message error">{error}</p>}
        <div className="login-actions">
          {!sent && (
            <button className="btn primary" type="submit" disabled={loading || !identifier.trim()}>
              {loading ? "Enviando..." : "Enviar instrucciones"}
            </button>
          )}
          <Link className="muted" href="/login">
            Volver al login
          </Link>
        </div>
      </form>
    </main>
  );
}
