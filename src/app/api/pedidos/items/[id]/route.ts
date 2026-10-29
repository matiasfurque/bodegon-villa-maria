import { NextRequest } from "next/server";
import { json, requirePermission } from "@/lib/api";
import { serializeOrderItem } from "@/modules/orders/order.serializer";
import { orderService } from "@/modules/orders/order.service";
import { transactionErrorResponse } from "@/lib/transaction-error";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json().catch(() => ({}));
  try {
    const result = await orderService.cancelItem(Number(id), data);

    if ("error" in result) return json({ error: result.error }, "status" in result && typeof result.status === "number" ? result.status : 400);
    return json(serializeOrderItem(result.updated));
  } catch (error) {
    return transactionErrorResponse(error, "pedido");
  }
}
