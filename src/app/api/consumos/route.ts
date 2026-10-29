import { NextRequest } from "next/server";
import { json, requirePermission } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { orderRepository } from "@/modules/orders/order.repository";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const mesaId = request.nextUrl.searchParams.get("mesaId");
  if (!mesaId) return json({ error: "mesaId es obligatorio" }, 400);

  const result = await prisma.$transaction(async (tx) => {
    const mesa = await tx.mesa.findUnique({ where: { id: Number(mesaId) } });
    if (!mesa) return null;
    const pedidos = mesa.atencionToken
      ? await orderRepository.listActiveConsumption(tx, mesa.id, mesa.atencionToken)
      : [];
    const total = pedidos.flatMap((pedido) => pedido.items)
      .reduce((sum, item) => sum + Number(item.subtotal), 0);
    return { mesa: { ...mesa, pedidos }, total };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  if (!result) return json({ error: "Mesa inexistente" }, 404);
  return json(result);
}
