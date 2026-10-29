import type { Prisma, PrismaClient } from "@prisma/client";
import {
  cancellationItemInclude,
  orderInclude,
  orderItemInclude,
  orderMutationInclude
} from "./order.types";

type OrderDb = PrismaClient | Prisma.TransactionClient;

export const orderRepository = {
  list(db: OrderDb, mesaId: number | null) {
    return db.pedido.findMany({
      where: { ...(mesaId ? { mesaId } : {}), estado: { esActivo: true }, atencionToken: { not: null } },
      orderBy: { fechaHora: "desc" },
      include: orderInclude
    });
  },

  listActiveConsumption(db: OrderDb, mesaId: number, atencionToken: string) {
    return db.pedido.findMany({
      where: { mesaId, atencionToken, estado: { esActivo: true } },
      orderBy: { fechaHora: "desc" },
      include: {
        estado: true,
        estadoCocina: true,
        usuario: { select: { nombre: true, apellido: true } },
        items: { where: { estado: { esAnulado: false } }, include: { producto: true, estado: true } }
      }
    });
  },

  lockOrder(db: OrderDb, pedidoId: number) {
    return db.$queryRaw`SELECT "id" FROM "Pedido" WHERE "id" = ${pedidoId} FOR UPDATE`;
  },

  lockActiveForTable(db: OrderDb, mesaId: number) {
    return db.$queryRaw`
      SELECT p."id" FROM "Pedido" p
      JOIN "PedidoEstado" e ON e."id" = p."estadoId"
      WHERE p."mesaId" = ${mesaId} AND e."esActivo" = true
      ORDER BY p."id" FOR UPDATE OF p
    `;
  },

  lockActiveItemsForTable(db: OrderDb, mesaId: number) {
    return db.$queryRaw`
      SELECT i."id" FROM "PedidoItem" i
      JOIN "Pedido" p ON p."id" = i."pedidoId"
      JOIN "PedidoEstado" e ON e."id" = p."estadoId"
      WHERE p."mesaId" = ${mesaId} AND e."esActivo" = true
      ORDER BY i."id" FOR UPDATE OF i
    `;
  },

  findActiveForAccount(db: OrderDb, mesaId: number) {
    return db.pedido.findMany({
      where: { mesaId, estado: { esActivo: true } },
      include: { estadoCocina: true, items: { include: { producto: true, estado: true } } }
    });
  },

  finalizeActiveForTable(db: OrderDb, mesaId: number, estadoId: number, atencionToken: string) {
    return db.pedido.updateMany({
      where: { mesaId, atencionToken, estado: { esActivo: true } },
      data: { estadoId }
    });
  },

  lockOrderForItem(db: OrderDb, itemId: number) {
    return db.$queryRaw<Array<{ id: number }>>`
      SELECT p."id" FROM "Pedido" p
      JOIN "PedidoItem" i ON i."pedidoId" = p."id"
      WHERE i."id" = ${itemId}
      FOR UPDATE OF p
    `;
  },

  lockItem(db: OrderDb, itemId: number) {
    return db.$queryRaw`SELECT "id" FROM "PedidoItem" WHERE "id" = ${itemId} FOR UPDATE`;
  },

  findForMutation(db: OrderDb, pedidoId: number) {
    return db.pedido.findUnique({ where: { id: pedidoId }, include: orderMutationInclude });
  },

  findBySolicitudId(db: OrderDb, solicitudId: string) {
    return db.pedido.findUnique({ where: { solicitudId }, include: orderInclude });
  },

  findItemForCancellation(db: OrderDb, itemId: number) {
    return db.pedidoItem.findUnique({ where: { id: itemId }, include: cancellationItemInclude });
  },

  findItemBySolicitudId(db: OrderDb, solicitudId: string) {
    return db.pedidoItem.findUnique({ where: { solicitudId }, include: orderItemInclude });
  },

  findSellableProducts(db: OrderDb, productIds: number[]) {
    return db.producto.findMany({ where: { id: { in: productIds }, estado: { permiteVenta: true } } });
  },

  findSellableProduct(db: OrderDb, productId: number) {
    return db.producto.findFirst({ where: { id: productId, estado: { permiteVenta: true } } });
  },

  findOrderState(db: OrderDb, codigo: string) {
    return db.pedidoEstado.findUniqueOrThrow({ where: { codigo } });
  },

  findKitchenStateByCode(db: OrderDb, codigo: string) {
    return db.pedidoEstadoCocina.findUniqueOrThrow({ where: { codigo } });
  },

  findKitchenState(db: OrderDb, text: string) {
    return db.pedidoEstadoCocina.findFirst({
      where: { OR: [{ codigo: text }, { nombre: { equals: text, mode: "insensitive" } }] }
    });
  },

  findClosedAccountDetail(db: OrderDb, pedidoId: number) {
    return db.cuentaDetalle.findFirst({
      where: { pedidoId, cuenta: { estado: { esCerrada: true } } },
      select: { id: true }
    });
  },

  findCancelledItemState(db: OrderDb, codigo: string) {
    return db.pedidoItemEstado.findUniqueOrThrow({ where: { codigo } });
  },

  findCancellationReason(db: OrderDb, codigo: string) {
    return db.motivoAnulacion.findUniqueOrThrow({ where: { codigo } });
  },

  create(db: OrderDb, data: Prisma.PedidoUncheckedCreateInput) {
    return db.pedido.create({ data, include: orderInclude });
  },

  update(db: OrderDb, pedidoId: number, data: Prisma.PedidoUncheckedUpdateInput) {
    return db.pedido.update({ where: { id: pedidoId }, data, include: orderInclude });
  },

  incrementContentRevision(db: OrderDb, pedidoId: number) {
    return db.pedido.update({ where: { id: pedidoId }, data: { revisionContenido: { increment: 1 } } });
  },

  createItem(db: OrderDb, data: Prisma.PedidoItemUncheckedCreateInput) {
    return db.pedidoItem.create({ data, include: orderItemInclude });
  },

  updateItem(db: OrderDb, itemId: number, data: Prisma.PedidoItemUncheckedUpdateInput) {
    return db.pedidoItem.update({ where: { id: itemId }, data, include: orderItemInclude });
  }
};
