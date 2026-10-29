import { NextRequest } from "next/server";
import { json, requirePermission, requireSession } from "@/lib/api";
import { tableService } from "@/modules/tables/table.service";
import { serializeMesa } from "@/modules/tables/table.serializer";
import { transactionErrorResponse } from "@/lib/transaction-error";

export async function GET(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const mesas = await tableService.list();
  return json(mesas.map(serializeMesa));
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const data = await request.json();
  const numero = Number(data.numero);
  const capacidad = Number(data.capacidad);
  if (!Number.isInteger(numero) || numero <= 0) {
    return json({ error: "Ingresá un número de mesa válido" }, 400);
  }
  if (!Number.isInteger(capacidad) || capacidad <= 0) {
    return json({ error: "Ingresá una capacidad válida" }, 400);
  }

  try {
    const result = await tableService.create({ ...data, numero, capacidad }, auth.session?.userId);
    if ("error" in result) return json({ error: result.error }, "status" in result && typeof result.status === "number" ? result.status : 400);
    return json(serializeMesa(result.mesa), result.created ? 201 : 200);
  } catch (error) {
    return transactionErrorResponse(error, "mesa");
  }
}
