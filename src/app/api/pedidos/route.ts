import { NextRequest } from "next/server";
import { json, requirePermission, requireSession } from "@/lib/api";
import { serializeOrder } from "@/modules/orders/order.serializer";
import { orderService } from "@/modules/orders/order.service";
import type { OrderInputItem } from "@/modules/orders/order.types";
import { transactionErrorResponse } from "@/lib/transaction-error";

export async function GET(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const mesaId = request.nextUrl.searchParams.get("mesaId");
  const pedidos = await orderService.list(mesaId ? Number(mesaId) : null);
  return json(pedidos.map(serializeOrder));
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const data = await request.json();
  const items: OrderInputItem[] = Array.isArray(data.items) ? data.items : [];
  if (!data.mesaId || items.length === 0) {
    return json({ error: "Seleccioná una mesa y al menos un producto" }, 400);
  }
  if (items.some((item) => Number(item.cantidad || 1) <= 0)) {
    return json({ error: "La cantidad debe ser mayor a cero" }, 400);
  }

  try {
    const result = await orderService.create({
      mesaId: Number(data.mesaId),
      usuarioId: auth.session!.userId,
      atencionToken: data.atencionToken,
      solicitudId: data.solicitudId,
      items,
      observacion: data.observacion
    });

    if ("error" in result) return json({ error: result.error }, "status" in result && typeof result.status === "number" ? result.status : 400);
    return json(serializeOrder(result.pedido), result.repeated ? 200 : 201);
  } catch (error) {
    return transactionErrorResponse(error, "pedido");
  }
}
