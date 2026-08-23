"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

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
      <form className="login-card" onSubmit={submit}>
        <h1>Villa Maria</h1>
        <p className="muted">Ingreso interno para gestionar mesas, pedidos, caja y reportes.</p>
        <div className="field">
          <label>Usuario</label>
          <input autoComplete="username" value={usuario} onChange={(event) => setUsuario(event.target.value)} />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        {params.get("passwordReset") === "1" && <p className="auth-message notice">Contraseña actualizada. Ingresá con tu nueva clave.</p>}
        {error && <p className="error">{error}</p>}
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
    </main>
  );
}
