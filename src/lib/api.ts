import { NextRequest, NextResponse } from "next/server";
import { isAdmin, sessionFromRequest } from "./auth";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function requireSession(request: NextRequest) {
  const session = sessionFromRequest(request);
  if (!session) {
    return { error: json({ error: "No autenticado" }, 401) as NextResponse, session: null };
  }
  return { error: null, session };
}

export function requireAdmin(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth;
  if (!isAdmin(auth.session?.role)) {
    return { error: json({ error: "No autorizado" }, 403) as NextResponse, session: auth.session };
  }
  return auth;
}

export function readNumber(value: FormDataEntryValue | null, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function asBool(value: unknown) {
  return value === true || value === "true" || value === "on" || value === "1";
}
