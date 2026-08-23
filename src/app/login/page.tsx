"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="login-wrap"><section className="login-card"><h1>Villa Maria</h1></section></main>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password })
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(data.error || "No se pudo iniciar sesion");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="login-wrap">
      <section className="login-layout" aria-label="Acceso interno Villa Maria">
        <aside className="login-brand-panel">
          <span className="auth-eyebrow">Sistema de gestion</span>
          <div>
            <p className="login-kicker">Villa Maria</p>
            <h1>Acceso interno</h1>
            <p>
              Gestion de mesas, pedidos, productos y reportes con una experiencia pensada
              para el equipo del salon.
            </p>
          </div>
          <div className="login-brand-footer">
            <span>Mataderos</span>
            <strong>Bodegon & cafeteria</strong>
          </div>
        </aside>

        <form className="login-card login-panel" onSubmit={submit}>
          <div className="login-panel-head">
            <span className="auth-eyebrow">Acceso interno</span>
            <h2>Villa Maria</h2>
            <p className="muted">Ingresá al panel para gestionar mesas, pedidos, caja y reportes.</p>
          </div>

          <div className="field">
            <label>Usuario</label>
            <div className="input-with-icon">
              <UserRound size={18} />
              <input autoComplete="username" value={usuario} onChange={(event) => setUsuario(event.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Contraseña</label>
            <div className="input-with-icon">
              <LockKeyhole size={18} />
              <input
                autoComplete="current-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {params.get("passwordReset") === "1" && <p className="auth-message notice">Contraseña actualizada. Ingresá con tu nueva clave.</p>}
          {error && <p className="auth-message error">{error}</p>}

          <div className="login-actions">
            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
            <Link className="muted" href="/recuperar-contrasena">
              Olvidé mi contraseña
            </Link>
            <Link className="muted" href="/">
              Volver al sitio publico
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
