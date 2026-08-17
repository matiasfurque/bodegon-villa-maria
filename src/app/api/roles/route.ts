import { NextRequest } from "next/server";
import { requireSession, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  return json(await prisma.role.findMany({ orderBy: { nombre: "asc" } }));
}
