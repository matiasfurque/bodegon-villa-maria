import { NextRequest } from "next/server";
import { json, requirePermission } from "@/lib/api";
import { prisma } from "@/lib/prisma";

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reportes.ver");
  if (auth.error) return auth.error;

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const start = from ? parseLocalDate(from) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = to ? parseLocalDate(to) : new Date(start);
  end.setHours(23, 59, 59, 999);

  const [cuentas, mesas, anulados, items] = await Promise.all([
    prisma.cuenta.findMany({
      where: { fechaCierre: { gte: start, lte: end } },
      include: { mesa: { include: { estado: true } }, metodoPago: true }
    }),
    prisma.mesa.findMany({ include: { estado: true } }),
    prisma.pedidoItem.count({
      where: {
        estado: { esAnulado: true },
        pedido: { fechaHora: { gte: start, lte: end } }
      }
    }),
    prisma.cuentaDetalle.findMany({
      where: {
        cuenta: { fechaCierre: { gte: start, lte: end } }
      }
    })
  ]);

  const totalPeriodo = cuentas.reduce((sum, cuenta) => sum + Number(cuenta.total), 0);
  const cobrosPorMetodo = new Map<string, { metodo: string; cantidad: number; total: number }>();
  for (const cuenta of cuentas) {
    const metodo = cuenta.metodoPago.nombre;
    const current = cobrosPorMetodo.get(metodo) || { metodo, cantidad: 0, total: 0 };
    current.cantidad += 1;
    current.total += Number(cuenta.total);
    cobrosPorMetodo.set(metodo, current);
  }
  const productos = new Map<string, { producto: string; cantidad: number; total: number }>();
  for (const item of items) {
    const current = productos.get(item.productoNombre) || {
      producto: item.productoNombre,
      cantidad: 0,
      total: 0
    };
    current.cantidad += item.cantidad;
    current.total += Number(item.subtotal);
    productos.set(item.productoNombre, current);
  }

  return json({
    from: start.toISOString(),
    to: end.toISOString(),
    totalDia: totalPeriodo,
    totalPeriodo,
    cuentasHoy: cuentas.length,
    cuentasPeriodo: cuentas.length,
    mesasOcupadas: mesas.filter((mesa) => mesa.estado.permitePedido).length,
    mesasAtendidasHoy: new Set(cuentas.map((cuenta) => cuenta.mesaId)).size,
    mesasAtendidasPeriodo: new Set(cuentas.map((cuenta) => cuenta.mesaId)).size,
    pedidosAnulados: anulados,
    cobrosPorMetodo: Array.from(cobrosPorMetodo.values()).sort((a, b) => b.total - a.total),
    productosMasVendidos: Array.from(productos.values())
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5)
  });
}
