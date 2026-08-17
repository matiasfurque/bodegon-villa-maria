import { NextRequest } from "next/server";
import { json, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type PedidoInputItem = {
  productoId: number | string;
  cantidad?: number | string;
  observacion?: string;
};

function includePedido() {
  return {
    mesa: true,
    usuario: { select: { id: true, nombre: true, apellido: true, usuario: true } },
    items: { include: { producto: true } }
  };
}

export async function GET(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const mesaId = request.nextUrl.searchParams.get("mesaId");
  const pedidos = await prisma.pedido.findMany({
    where: mesaId ? { mesaId: Number(mesaId) } : {},
    orderBy: { fechaHora: "desc" },
    include: includePedido()
  });
  return json(pedidos);
}

export async function POST(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const data = await request.json();
  const items: PedidoInputItem[] = Array.isArray(data.items) ? data.items : [];
  if (!data.mesaId || items.length === 0) {
    return json({ error: "Seleccioná una mesa y al menos un producto" }, 400);
  }
  if (items.some((item) => Number(item.cantidad || 1) <= 0)) {
    return json({ error: "La cantidad debe ser mayor a cero" }, 400);
  }

  const mesa = await prisma.mesa.findUnique({ where: { id: Number(data.mesaId) } });
  if (!mesa || mesa.estado !== "Ocupada") {
    return json({ error: "La mesa debe estar ocupada para registrar pedidos" }, 400);
  }

  const productIds = items.map((item) => Number(item.productoId));
  const products = await prisma.producto.findMany({ where: { id: { in: productIds }, activo: true } });
  const productMap = new Map(products.map((product) => [product.id, product]));

  const pedido = await prisma.pedido.create({
    data: {
      mesaId: Number(data.mesaId),
      usuarioId: auth.session!.userId,
      observacion: data.observacion || null,
      items: {
        create: items.map((item) => {
          const product = productMap.get(Number(item.productoId));
          if (!product) throw new Error("Producto inválido");
          const cantidad = Number(item.cantidad || 1);
          const precio = Number(product.precio);
          return {
            productoId: product.id,
            cantidad,
            precioUnitario: precio,
            subtotal: precio * cantidad,
            observacion: item.observacion || null
          };
        })
      }
    },
    include: includePedido()
  });

  return json(pedido, 201);
}
