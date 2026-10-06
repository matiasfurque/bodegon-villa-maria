import { NextRequest } from "next/server";
import { json, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;

  const [
    mesaEstados,
    pedidoEstados,
    cocinaEstados,
    metodosPago,
    cuentaEstados,
    usuarioEstados,
    productoEstados,
    productoVisibilidades,
    pedidoItemEstados,
    motivosAnulacion,
    sectoresMesa
  ] = await Promise.all([
    prisma.mesaEstado.findMany({ orderBy: { orden: "asc" } }),
    prisma.pedidoEstado.findMany({ orderBy: { orden: "asc" } }),
    prisma.pedidoEstadoCocina.findMany({ orderBy: { orden: "asc" } }),
    prisma.metodoPago.findMany({ where: { estado: { habilitado: true } }, orderBy: { orden: "asc" }, include: { estado: true } }),
    prisma.cuentaEstado.findMany({ orderBy: { orden: "asc" } }),
    prisma.usuarioEstado.findMany({ orderBy: { orden: "asc" } }),
    prisma.productoEstado.findMany({ orderBy: { orden: "asc" } }),
    prisma.productoVisibilidad.findMany({ orderBy: { orden: "asc" } }),
    prisma.pedidoItemEstado.findMany({ orderBy: { orden: "asc" } }),
    prisma.motivoAnulacion.findMany({ where: { estado: { habilitado: true } }, orderBy: { nombre: "asc" }, include: { estado: true } }),
    prisma.sectorMesa.findMany({ where: { estado: { habilitado: true } }, orderBy: [{ orden: "asc" }, { nombre: "asc" }], include: { estado: true } })
  ]);

  return json({
    mesaEstados,
    pedidoEstados,
    cocinaEstados,
    metodosPago,
    cuentaEstados,
    usuarioEstados,
    productoEstados,
    productoVisibilidades,
    pedidoItemEstados,
    motivosAnulacion,
    sectoresMesa
  });
}
