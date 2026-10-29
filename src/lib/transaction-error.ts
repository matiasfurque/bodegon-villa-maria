import { Prisma } from "@prisma/client";
import { json } from "./api";

type Operation = "mesa" | "pedido" | "cuenta";

const uncertainMessage: Record<Operation, string> = {
  mesa: "No se pudo confirmar la operación por una espera prolongada. Actualizá la mesa antes de volver a actuar.",
  pedido: "No se pudo confirmar la operación por una espera prolongada. Actualizá y conservá el mismo borrador e identificador de solicitud.",
  cuenta: "No se pudo confirmar el resultado del cobro. Usá Verificar resultado del cobro antes de intentar otro cierre."
};

function classify(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  if (error.code === "P2034") return "write-conflict";
  if (error.code === "P2010" && error.meta?.code === "55P03" &&
      typeof error.meta?.message === "string" &&
      /^(?:ERROR: )?canceling statement due to lock timeout$/.test(error.meta.message)) {
    return "lock-timeout";
  }
  if (error.code !== "P2028") return null;
  const detail = error.meta?.error;
  if (typeof detail !== "string") return null;
  if (/^Unable to start a transaction in the given time\.?$/.test(detail)) return "start-timeout";
  if (/^Transaction already closed: (?:A query|A commit) cannot be executed on an expired transaction\./.test(detail)) {
    return "execution-timeout";
  }
  return null;
}

export function transactionErrorResponse(error: unknown, operation: Operation) {
  const kind = classify(error);
  const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
  const detail = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.error : undefined;
  const sqlstate = error instanceof Prisma.PrismaClientKnownRequestError &&
    typeof error.meta?.code === "string" ? error.meta.code : undefined;
  const timing = typeof detail === "string"
    ? /The timeout for this transaction was (\d+) ms, however (\d+) ms passed/.exec(detail)
    : null;
  // Never log the query, request body, token, or raw Prisma message.
  console.error("Operational transaction error", {
    operation, kind: kind ?? "unexpected", code, ...(sqlstate ? { sqlstate } : {}),
    name: error instanceof Error ? error.name : typeof error,
    ...(timing ? { timeoutMs: Number(timing[1]), elapsedMs: Number(timing[2]) } : {})
  });
  if (kind) return json({ error: uncertainMessage[operation] }, 503);
  return json({ error: "No se pudo confirmar la operación. Actualizá y verificá el resultado antes de intentar nuevamente." }, 500);
}
