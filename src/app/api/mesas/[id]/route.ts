import { NextRequest } from "next/server";
import { json, requirePermission } from "@/lib/api";
import { tableService } from "@/modules/tables/table.service";
import { serializeMesa } from "@/modules/tables/table.serializer";
import { transactionErrorResponse } from "@/lib/transaction-error";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json();
  try {
    const result = await tableService.update(Number(id), data, auth.session?.userId);
    if ("error" in result) return json({ error: result.error }, "status" in result && typeof result.status === "number" ? result.status : 400);
    return json(serializeMesa(result.mesa));
  } catch (error) {
    return transactionErrorResponse(error, "mesa");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json().catch(() => ({}));
  try {
    const result = await tableService.remove(Number(id), data);
    if ("error" in result) return json({ error: result.error }, "status" in result && typeof result.status === "number" ? result.status : 400);
    return json(serializeMesa(result.mesa));
  } catch (error) {
    return transactionErrorResponse(error, "mesa");
  }
}
