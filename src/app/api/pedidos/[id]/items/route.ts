import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { json, requirePermission } from "@/lib/api";
import { CODES } from "@/lib/normalized";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json();
  const pedidoId = Number(id);
  const result = await prisma.$transaction(async (tx) => {
    const lockedMesa = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT m."id" FROM "Mesa" m
      JOIN "Pedido" p ON p."mesaId" = m."id"
      WHERE p."id" = ${pedidoId}
      FOR UPDATE OF m
    `;
    await tx.$queryRaw`SELECT "id" FROM "Pedido" WHERE "id" = ${pedidoId} FOR UPDATE`;
    const pedido = await tx.pedido.findUnique({
      where: { id: pedidoId },
      include: { mesa: { include: { estado: true } }, estado: true, estadoCocina: true }
    });
    if (!pedido || pedido.mesaId !== lockedMesa[0]?.id || !pedido.estado.esActivo ||
        pedido.mesa.estado.codigo !== CODES.mesa.ocupada || !pedido.mesa.estado.permitePedido) {
      return { error: "El pedido no puede modificarse" };
    }
    if (!pedido.estadoCocina.permiteAgregarItems) {
      return { error: "El pedido ya esta cerrado para cocina. Creá un nuevo pedido." };
    }
    const product = await tx.producto.findFirst({
      where: { id: Number(data.productoId), estado: { permiteVenta: true } }
    });
    if (!product) return { error: "Producto inválido" };
    const cantidad = Number(data.cantidad || 1);
    if (cantidad <= 0) return { error: "La cantidad debe ser mayor a cero" };
    const precio = Number(product.precio);
    const item = await tx.pedidoItem.create({
      data: {
        pedidoId,
        productoId: product.id,
        cantidad,
        precioUnitario: precio,
        subtotal: precio * cantidad,
        observacion: data.observacion || null
      },
      include: { producto: true, estado: true, motivoAnulacion: true }
    });
    return { item };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  if ("error" in result) return json({ error: result.error }, 400);
  const item = result.item;
  return json({
    ...item,
    anulado: item.estado.esAnulado,
    motivoAnulacion: item.motivoAnulacion?.nombre || item.motivoAnulacionDetalle || null
  }, 201);
}
