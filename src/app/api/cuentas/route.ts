import { NextRequest } from "next/server";
import { json, requireAdmin, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const PAYMENT_METHODS = ["Efectivo", "Debito", "Credito", "Transferencia"];

export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
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
      mesa: true,
      usuarioCierre: { select: { nombre: true, apellido: true, usuario: true } }
    }
  });
  return json(cuentas);
}

export async function POST(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const data = await request.json();
  if (!data.mesaId) return json({ error: "mesaId es obligatorio" }, 400);

  const mesa = await prisma.mesa.findUnique({
    where: { id: Number(data.mesaId) },
    include: {
      pedidos: {
        where: { estado: "Activo" },
        include: { items: { include: { producto: true } } }
      }
    }
  });
  if (!mesa) return json({ error: "Mesa inválida" }, 400);

  const validItems = mesa.pedidos.flatMap((pedido) =>
    pedido.items
      .filter((item) => !item.anulado)
      .map((item) => ({
        pedidoId: pedido.id,
        producto: item.producto.nombre,
        cantidad: item.cantidad,
        precioUnitario: Number(item.precioUnitario),
        subtotal: Number(item.subtotal)
      }))
  );
  const total = validItems.reduce((sum, item) => sum + item.subtotal, 0);
  if (total <= 0) return json({ error: "No hay consumos para cerrar" }, 400);
  const metodoPago = PAYMENT_METHODS.includes(data.metodoPago) ? data.metodoPago : "Efectivo";
  const montoRecibido = metodoPago === "Efectivo" ? Number(data.montoRecibido || 0) : total;
  if (!Number.isFinite(montoRecibido) || montoRecibido < total) {
    return json({ error: "El monto recibido no puede ser menor al total" }, 400);
  }
  const vuelto = metodoPago === "Efectivo" ? montoRecibido - total : 0;

  const cuenta = await prisma.$transaction(async (tx) => {
    await tx.pedido.updateMany({
      where: { mesaId: mesa.id, estado: "Activo" },
      data: { estado: "Finalizado" }
    });
    const created = await tx.cuenta.create({
      data: {
        mesaId: mesa.id,
        usuarioCierreId: auth.session!.userId,
        total,
        metodoPago,
        montoRecibido,
        vuelto,
        detalleJson: JSON.stringify(validItems)
      },
      include: { mesa: true, usuarioCierre: { select: { nombre: true, apellido: true, usuario: true } } }
    });
    await tx.mesa.update({
      where: { id: mesa.id },
      data: { estado: "Libre", abiertaAt: null, abiertaPor: null }
    });
    return created;
  });

  return json(cuenta, 201);
}
