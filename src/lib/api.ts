import { NextRequest, NextResponse } from "next/server";
import { sessionFromRequest } from "./auth";
import { prisma } from "./prisma";

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

export async function requirePermission(request: NextRequest, permission: string) {
  return requireAnyPermission(request, [permission]);
}

export async function requireAnyPermission(request: NextRequest, permissions: string[]) {
  const auth = requireSession(request);
  if (auth.error) return auth;

  const user = await prisma.user.findFirst({
    where: {
      id: auth.session!.userId,
      estado: { permiteAcceso: true },
      role: {
        permisos: {
          some: {
            permiso: { codigo: { in: permissions } }
          }
        }
      }
    },
    select: { id: true }
  });

  if (!user) {
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
