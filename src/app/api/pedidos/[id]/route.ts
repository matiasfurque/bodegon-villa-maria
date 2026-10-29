import { NextRequest } from "next/server";
import { json, requireAnyPermission } from "@/lib/api";
import { serializeOrder } from "@/modules/orders/order.serializer";
import { orderService } from "@/modules/orders/order.service";
import { transactionErrorResponse } from "@/lib/transaction-error";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyPermission(request, ["cocina.gestionar", "operaciones.gestionar"]);
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json();
  try {
    const result = await orderService.update(Number(id), data);

    if ("error" in result) return json({ error: result.error }, result.status);
    return json(serializeOrder(result.updated));
  } catch (error) {
    return transactionErrorResponse(error, "pedido");
  }
}
