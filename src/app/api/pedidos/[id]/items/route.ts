import { NextRequest } from "next/server";
import { json, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json();
  const pedido = await prisma.pedido.findUnique({ where: { id: Number(id) }, include: { mesa: true } });
  if (!pedido || pedido.estado !== "Activo" || pedido.mesa.estado !== "Ocupada") {
    return json({ error: "El pedido no puede modificarse" }, 400);
  }
  const product = await prisma.producto.findFirst({ where: { id: Number(data.productoId), activo: true } });
  if (!product) return json({ error: "Producto inválido" }, 400);
  const cantidad = Number(data.cantidad || 1);
  if (cantidad <= 0) return json({ error: "La cantidad debe ser mayor a cero" }, 400);
  const precio = Number(product.precio);
  const item = await prisma.pedidoItem.create({
    data: {
      pedidoId: Number(id),
      productoId: product.id,
      cantidad,
      precioUnitario: precio,
      subtotal: precio * cantidad,
      observacion: data.observacion || null
    },
    include: { producto: true }
  });
  return json(item, 201);
}
