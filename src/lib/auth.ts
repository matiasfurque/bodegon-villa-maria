import crypto from "crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";

const COOKIE_NAME = "bvm_session";

type SessionPayload = {
  userId: number;
  usuario: string;
  role: string;
  exp: number;
};

function secret() {
  return process.env.AUTH_SECRET || "cambiar-este-secreto-en-produccion";
}

function sign(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

function encode(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token?: string): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature || sign(body) !== signature) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSessionCookie(user: { id: number; usuario: string; role: { nombre: string } }) {
  return encode({
    userId: user.id,
    usuario: user.usuario,
    role: user.role.nombre,
    exp: Date.now() + 1000 * 60 * 60 * 8
  });
}

export async function setSession(token: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export function sessionFromRequest(request: NextRequest) {
  return decode(request.cookies.get(COOKIE_NAME)?.value);
}

export async function currentUser() {
  const jar = await cookies();
  const payload = decode(jar.get(COOKIE_NAME)?.value);
  if (!payload) return null;
  return prisma.user.findFirst({
    where: { id: payload.userId, estado: true },
    select: {
      id: true,
      nombre: true,
      apellido: true,
      usuario: true,
      email: true,
      role: { select: { nombre: true } }
    }
  });
}

export function isAdmin(role?: string) {
  return role === "Administrador";
}
