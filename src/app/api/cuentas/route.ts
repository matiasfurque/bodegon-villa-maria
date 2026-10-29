import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { json, requirePermission } from "@/lib/api";
import { serializeAccount } from "@/modules/accounts/account.serializer";
import { accountService, CloseAccountError } from "@/modules/accounts/account.service";
import { transactionErrorResponse } from "@/lib/transaction-error";

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "historial.ver");
  if (auth.error) return auth.error;
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const mesaId = request.nextUrl.searchParams.get("mesaId");
  const fromDate = from ? parseLocalDate(from) : undefined;
  const toDate = to ? parseLocalDate(to) : undefined;
  if (fromDate) fromDate.setHours(0, 0, 0, 0);
  if (toDate) toDate.setHours(23, 59, 59, 999);
  const cuentas = await accountService.list({
    mesaId: mesaId ? Number(mesaId) : undefined,
    fromDate,
    toDate,
    hasDateFilter: Boolean(from || to)
  });
  return json(cuentas.map(serializeAccount));
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const data = await request.json();
  if (!data.mesaId) return json({ error: "mesaId es obligatorio" }, 400);

  try {
    const cuenta = await accountService.close({
      mesaId: Number(data.mesaId),
      atencionToken: data.atencionToken,
      usuarioCierreId: auth.session!.userId,
      metodoPago: data.metodoPago,
      montoRecibido: data.montoRecibido
    });
    return json(serializeAccount(cuenta), 201);
  } catch (error) {
    if (error instanceof CloseAccountError) return json({ error: error.message }, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" &&
        (error.meta?.target as string[] | undefined)?.includes("atencionToken")) {
      return json({ error: "La atención de la mesa ya fue cerrada. Actualizá la información." }, 409);
    }
    return transactionErrorResponse(error, "cuenta");
  }
}
