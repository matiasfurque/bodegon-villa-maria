import { prisma } from "./prisma";

export const CODES = {
  usuario: {
    activo: "USUARIO_ACTIVO",
    inactivo: "USUARIO_INACTIVO",
    bloqueado: "USUARIO_BLOQUEADO"
  },
  mesa: {
    libre: "MESA_LIBRE",
    ocupada: "MESA_OCUPADA",
    cerrada: "MESA_CERRADA"
  },
  producto: {
    activo: "PRODUCTO_ACTIVO",
    inactivo: "PRODUCTO_INACTIVO"
  },
  productoVisibilidad: {
    visible: "PRODUCTO_VISIBLE_MENU",
    oculto: "PRODUCTO_OCULTO_MENU"
  },
  categoria: {
    visible: "CATEGORIA_VISIBLE",
    oculta: "CATEGORIA_OCULTA",
    inactiva: "CATEGORIA_INACTIVA"
  },
  pedido: {
    activo: "PEDIDO_ACTIVO",
    finalizado: "PEDIDO_FINALIZADO",
    anulado: "PEDIDO_ANULADO"
  },
  item: {
    activo: "ITEM_ACTIVO",
    anulado: "ITEM_ANULADO"
  },
  motivoAnulacion: {
    correccionPedido: "MOTIVO_CORRECCION_PEDIDO",
    clienteCancelo: "MOTIVO_CLIENTE_CANCELO",
    sinStock: "MOTIVO_SIN_STOCK",
    otro: "MOTIVO_OTRO"
  },
  cocina: {
    pendiente: "COCINA_PENDIENTE",
    enPreparacion: "COCINA_EN_PREPARACION",
    listo: "COCINA_LISTO",
    entregado: "COCINA_ENTREGADO"
  },
  pago: {
    efectivo: "PAGO_EFECTIVO",
    activo: "METODO_PAGO_ACTIVO",
    inactivo: "METODO_PAGO_INACTIVO"
  },
  sector: {
    activo: "SECTOR_ACTIVO",
    inactivo: "SECTOR_INACTIVO"
  },
  motivoEstado: {
    activo: "MOTIVO_ACTIVO",
    inactivo: "MOTIVO_INACTIVO"
  },
  cuenta: {
    cerrada: "CUENTA_CERRADA"
  }
} as const;

function normalizedBool(value: unknown) {
  return value === true || value === "true" || value === "on" || value === "1";
}

async function findByCodeOrName<T extends { codigo: string }>(
  delegate: { findFirstOrThrow: (args: { where: object }) => Promise<T> },
  value: unknown,
  fallbackCodigo: string
) {
  const text = String(value || "").trim();
  return delegate.findFirstOrThrow({
    where: text
      ? { OR: [{ codigo: text }, { nombre: { equals: text, mode: "insensitive" } }] }
      : { codigo: fallbackCodigo }
  });
}

export async function usuarioEstadoBy(value: unknown, fallbackCodigo = CODES.usuario.activo) {
  if (typeof value === "boolean" || ["true", "false", "on", "1", "0"].includes(String(value))) {
    return prisma.usuarioEstado.findUniqueOrThrow({
      where: { codigo: normalizedBool(value) ? CODES.usuario.activo : CODES.usuario.inactivo }
    });
  }
  return findByCodeOrName(prisma.usuarioEstado, value, fallbackCodigo);
}

export async function mesaEstadoBy(value: unknown, fallbackCodigo = CODES.mesa.libre) {
  return findByCodeOrName(prisma.mesaEstado, value, fallbackCodigo);
}

export async function sectorMesaBy(value: unknown) {
  const nombre = String(value || "").trim() || "General";
  const estado = await prisma.sectorMesaEstado.findUniqueOrThrow({ where: { codigo: CODES.sector.activo } });
  return prisma.sectorMesa.upsert({
    where: { nombre },
    update: { estadoId: estado.id },
    create: { nombre, estadoId: estado.id }
  });
}

export async function categoriaEstadoBy(value: unknown, fallbackCodigo = CODES.categoria.visible) {
  if (typeof value === "boolean" || ["true", "false", "on", "1", "0"].includes(String(value))) {
    return prisma.categoriaProductoEstado.findUniqueOrThrow({
      where: { codigo: normalizedBool(value) ? CODES.categoria.visible : CODES.categoria.oculta }
    });
  }
  return findByCodeOrName(prisma.categoriaProductoEstado, value, fallbackCodigo);
}

export async function productoEstadoBy(value: unknown, fallbackCodigo = CODES.producto.activo) {
  if (typeof value === "boolean" || ["true", "false", "on", "1", "0"].includes(String(value))) {
    return prisma.productoEstado.findUniqueOrThrow({
      where: { codigo: normalizedBool(value) ? CODES.producto.activo : CODES.producto.inactivo }
    });
  }
  return findByCodeOrName(prisma.productoEstado, value, fallbackCodigo);
}

export async function productoVisibilidadBy(value: unknown, fallbackCodigo = CODES.productoVisibilidad.visible) {
  if (typeof value === "boolean" || ["true", "false", "on", "1", "0"].includes(String(value))) {
    return prisma.productoVisibilidad.findUniqueOrThrow({
      where: { codigo: normalizedBool(value) ? CODES.productoVisibilidad.visible : CODES.productoVisibilidad.oculto }
    });
  }
  return findByCodeOrName(prisma.productoVisibilidad, value, fallbackCodigo);
}

export async function pedidoEstadoByCodigo(codigo: string) {
  return prisma.pedidoEstado.findUniqueOrThrow({ where: { codigo } });
}

export async function cocinaEstadoBy(value: unknown, fallbackCodigo = CODES.cocina.pendiente) {
  return findByCodeOrName(prisma.pedidoEstadoCocina, value, fallbackCodigo);
}

export async function metodoPagoBy(value: unknown) {
  const text = String(value || "").trim();
  return prisma.metodoPago.findFirst({
    where: text
      ? { estado: { habilitado: true }, OR: [{ codigo: text }, { nombre: { equals: text, mode: "insensitive" } }] }
      : { codigo: CODES.pago.efectivo, estado: { habilitado: true } }
  });
}

export async function cuentaEstadoByCodigo(codigo: string) {
  return prisma.cuentaEstado.findUniqueOrThrow({ where: { codigo } });
}

export async function pedidoItemEstadoByCodigo(codigo: string) {
  return prisma.pedidoItemEstado.findUniqueOrThrow({ where: { codigo } });
}

export async function motivoAnulacionBy(value: unknown) {
  const text = String(value || "").trim();
  const codigo =
    text.toLowerCase().includes("stock")
      ? CODES.motivoAnulacion.sinStock
      : text.toLowerCase().includes("cliente")
        ? CODES.motivoAnulacion.clienteCancelo
        : text.toLowerCase().includes("correcci")
          ? CODES.motivoAnulacion.correccionPedido
          : CODES.motivoAnulacion.otro;

  return prisma.motivoAnulacion.findUniqueOrThrow({ where: { codigo } });
}
