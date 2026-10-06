import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { json, requirePermission } from "@/lib/api";
import { CODES } from "@/lib/normalized";
import { prisma } from "@/lib/prisma";

class CloseAccountError extends Error {}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
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

function serializeCuenta(cuenta: {
  metodoPago: { nombre: string; codigo: string; requiereMontoRecibido: boolean };
  estado: { nombre: string; codigo: string };
  mesa: { estado: { nombre: string; codigo: string; permitePedido: boolean; liberaMesa: boolean } } & Record<string, unknown>;
  detalles?: Array<Record<string, unknown>>;
} & Record<string, unknown>) {
  return {
    ...cuenta,
    metodoPago: cuenta.metodoPago.nombre,
    metodoPagoCodigo: cuenta.metodoPago.codigo,
    metodoPagoRequiereMontoRecibido: cuenta.metodoPago.requiereMontoRecibido,
    estado: cuenta.estado.nombre,
    estadoCodigo: cuenta.estado.codigo,
    mesa: serializeMesa(cuenta.mesa),
    detalleJson: JSON.stringify(cuenta.detalles || [])
  };
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "historial.ver");
  if (auth.error) return auth.error;
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const mesaId = request.nextUrl.searchParams.get("mesaId");
  const fromDate = from ? parseLocalDate(from) : undefined;
  const toDate = to ? parseLocalDate(to) : undefined;
  if (fromDate) fromDate.setHours(0, 0, 0, 0);
  if (toDate) toDate.setHours(23, 59, 59, 999);
  const cuentas = await prisma.cuenta.findMany({
    where: {
      mesaId: mesaId ? Number(mesaId) : undefined,
      fechaCierre: from || to ? {
        gte: fromDate,
        lte: toDate
      } : undefined
    },
    orderBy: { fechaCierre: "desc" },
    include: {
      mesa: { include: { estado: true } },
      usuarioCierre: { select: { nombre: true, apellido: true, usuario: true } },
      metodoPago: true,
      estado: true,
      detalles: true
    }
  });
  return json(cuentas.map(serializeCuenta));
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const data = await request.json();
  if (!data.mesaId) return json({ error: "mesaId es obligatorio" }, 400);
  const mesaId = Number(data.mesaId);

  try {
    const cuenta = await prisma.$transaction(async (tx) => {
      // Lock the billing snapshot before reading it or changing any order.
      await tx.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${mesaId} FOR UPDATE`;
      const mesa = await tx.mesa.findUnique({ where: { id: mesaId }, include: { estado: true } });
      if (!mesa || mesa.estado.codigo !== CODES.mesa.ocupada) {
        throw new CloseAccountError("Mesa inválida");
      }

      await tx.$queryRaw`
        SELECT p."id" FROM "Pedido" p
        JOIN "PedidoEstado" e ON e."id" = p."estadoId"
        WHERE p."mesaId" = ${mesaId} AND e."esActivo" = true
        ORDER BY p."id" FOR UPDATE OF p
      `;
      await tx.$queryRaw`
        SELECT i."id" FROM "PedidoItem" i
        JOIN "Pedido" p ON p."id" = i."pedidoId"
        JOIN "PedidoEstado" e ON e."id" = p."estadoId"
        WHERE p."mesaId" = ${mesaId} AND e."esActivo" = true
        ORDER BY i."id" FOR UPDATE OF i
      `;

      const pedidos = await tx.pedido.findMany({
        where: { mesaId, estado: { esActivo: true } },
        include: { estadoCocina: true, items: { include: { producto: true, estado: true } } }
      });
      const pedidosSinEntregar = pedidos.filter((pedido) => pedido.estadoCocina.visibleCocina);
      if (pedidosSinEntregar.length > 0) {
        const estados = Array.from(new Set(pedidosSinEntregar.map((pedido) => pedido.estadoCocina.nombre))).join(", ");
        throw new CloseAccountError(
          `No se puede cerrar la cuenta: hay pedidos sin entregar (${estados}). Marcá los pedidos como entregados antes de cobrar.`
        );
      }

      const validItems = pedidos.flatMap((pedido) =>
        pedido.items
          .filter((item) => !item.estado.esAnulado)
          .map((item) => ({
            pedidoId: pedido.id,
            productoId: item.productoId,
            producto: item.producto.nombre,
            cantidad: item.cantidad,
            precioUnitario: Number(item.precioUnitario),
            subtotal: Number(item.subtotal),
            observacion: item.observacion
          }))
      );
      const total = validItems.reduce((sum, item) => sum + item.subtotal, 0);
      if (total <= 0) throw new CloseAccountError("No hay consumos para cerrar");

      const metodoPagoValue = String(data.metodoPago || "").trim();
      const metodoPago = await tx.metodoPago.findFirst({
        where: metodoPagoValue
          ? { estado: { habilitado: true }, OR: [{ codigo: metodoPagoValue }, { nombre: { equals: metodoPagoValue, mode: "insensitive" } }] }
          : { codigo: CODES.pago.efectivo, estado: { habilitado: true } }
      });
      if (!metodoPago) throw new CloseAccountError("Método de pago inválido");
      const montoRecibido = metodoPago.requiereMontoRecibido ? Number(data.montoRecibido || 0) : total;
      if (!Number.isFinite(montoRecibido) || montoRecibido < total) {
        throw new CloseAccountError("El monto recibido no puede ser menor al total");
      }
      const vuelto = metodoPago.requiereMontoRecibido ? montoRecibido - total : 0;
      const pedidoFinalizado = await tx.pedidoEstado.findUniqueOrThrow({ where: { codigo: CODES.pedido.finalizado } });
      const mesaLibre = await tx.mesaEstado.findUniqueOrThrow({ where: { codigo: CODES.mesa.libre } });
      const cuentaCerrada = await tx.cuentaEstado.findUniqueOrThrow({ where: { codigo: CODES.cuenta.cerrada } });

      await tx.pedido.updateMany({
        where: { mesaId, estado: { esActivo: true } },
        data: { estadoId: pedidoFinalizado.id }
      });
      const created = await tx.cuenta.create({
        data: {
          mesaId,
          usuarioCierreId: auth.session!.userId,
          total,
          metodoPagoId: metodoPago.id,
          montoRecibido,
          vuelto,
          estadoId: cuentaCerrada.id,
          detalles: {
            create: validItems.map((item) => ({
              pedidoId: item.pedidoId,
              productoId: item.productoId,
              productoNombre: item.producto,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              subtotal: item.subtotal,
              observacion: item.observacion || null
            }))
          }
        },
        include: {
          mesa: { include: { estado: true } },
          usuarioCierre: { select: { nombre: true, apellido: true, usuario: true } },
          metodoPago: true,
          estado: true,
          detalles: true
        }
      });
      await tx.mesa.update({
        where: { id: mesaId },
        data: { estadoId: mesaLibre.id, abiertaAt: null, abiertaPor: null }
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    return json(serializeCuenta(cuenta), 201);
  } catch (error) {
    if (error instanceof CloseAccountError) return json({ error: error.message }, 400);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return json({ error: "La mesa cambió durante el cierre. Intentá nuevamente." }, 409);
    }
    throw error;
  }
}
