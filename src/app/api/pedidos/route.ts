import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { json, requirePermission, requireSession } from "@/lib/api";
import { CODES } from "@/lib/normalized";
import { prisma } from "@/lib/prisma";

type PedidoInputItem = {
  productoId: number | string;
  cantidad?: number | string;
  observacion?: string;
};

function includePedido() {
  return {
    mesa: { include: { estado: true } },
    usuario: { select: { id: true, nombre: true, apellido: true, usuario: true } },
    estado: true,
    estadoCocina: true,
    items: { include: { producto: true, estado: true, motivoAnulacion: true } }
  };
}

function serializeMesa(mesa: { estado: { nombre: string; codigo: string; permitePedido: boolean; liberaMesa: boolean } } & Record<string, unknown>) {
  return {
    ...mesa,
    estado: mesa.estado.nombre,
    estadoCodigo: mesa.estado.codigo,
    estadoPermitePedido: mesa.estado.permitePedido,
    estadoLiberaMesa: mesa.estado.liberaMesa
  };
}

function serializePedido(pedido: { estado: { nombre: string; codigo: string; esActivo: boolean }; estadoCocina: { nombre: string; codigo: string; permiteAgregarItems: boolean; visibleCocina: boolean; notificaMozo: boolean }; mesa?: ({ estado: { nombre: string; codigo: string; permitePedido: boolean; liberaMesa: boolean } } & Record<string, unknown>) | null } & Record<string, unknown>) {
  const items = Array.isArray(pedido.items)
    ? (pedido.items as Array<Record<string, any>>).map((item) => ({
        ...item,
        anulado: Boolean(item.estado?.esAnulado),
        motivoAnulacion: item.motivoAnulacion?.nombre || item.motivoAnulacionDetalle || null
      }))
    : pedido.items;
  return {
    ...pedido,
    estado: pedido.estado.nombre,
    estadoCodigo: pedido.estado.codigo,
    estadoActivo: pedido.estado.esActivo,
    estadoCocina: pedido.estadoCocina.nombre,
    estadoCocinaCodigo: pedido.estadoCocina.codigo,
    estadoCocinaPermiteAgregarItems: pedido.estadoCocina.permiteAgregarItems,
    estadoCocinaVisible: pedido.estadoCocina.visibleCocina,
    estadoCocinaNotificaMozo: pedido.estadoCocina.notificaMozo,
    items,
    mesa: pedido.mesa ? serializeMesa(pedido.mesa) : pedido.mesa
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
  return json(pedidos.map(serializePedido));
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const data = await request.json();
  const items: PedidoInputItem[] = Array.isArray(data.items) ? data.items : [];
  if (!data.mesaId || items.length === 0) {
    return json({ error: "Seleccioná una mesa y al menos un producto" }, 400);
  }
  if (items.some((item) => Number(item.cantidad || 1) <= 0)) {
    return json({ error: "La cantidad debe ser mayor a cero" }, 400);
  }

  const mesaId = Number(data.mesaId);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${mesaId} FOR UPDATE`;
    const mesa = await tx.mesa.findUnique({ where: { id: mesaId }, include: { estado: true } });
    if (!mesa || mesa.estado.codigo !== CODES.mesa.ocupada || !mesa.estado.permitePedido) {
      return { error: "La mesa debe estar ocupada para registrar pedidos" };
    }

    const productIds = items.map((item) => Number(item.productoId));
    const products = await tx.producto.findMany({ where: { id: { in: productIds }, estado: { permiteVenta: true } } });
    const productMap = new Map(products.map((product) => [product.id, product]));
    const estado = await tx.pedidoEstado.findUniqueOrThrow({ where: { codigo: CODES.pedido.activo } });
    const estadoCocina = await tx.pedidoEstadoCocina.findUniqueOrThrow({ where: { codigo: CODES.cocina.pendiente } });

    const pedido = await tx.pedido.create({
      data: {
        mesaId,
        usuarioId: auth.session!.userId,
        estadoId: estado.id,
        estadoCocinaId: estadoCocina.id,
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
    return { pedido };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  if ("error" in result) return json({ error: result.error }, 400);
  return json(serializePedido(result.pedido), 201);
}
