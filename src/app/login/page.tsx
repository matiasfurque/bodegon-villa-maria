"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
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
        {error && <p className="error">{error}</p>}
        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
        <Link className="muted" href="/">
          Volver al sitio publico
        </Link>
      </form>
    </main>
  );
}
