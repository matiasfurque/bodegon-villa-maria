import { Prisma } from "@prisma/client";
import { CODES } from "@/lib/normalized";
import { prisma } from "@/lib/prisma";
import { setOperationLockTimeout } from "@/lib/transaction-lock";
import { orderRepository } from "@/modules/orders/order.repository";
import { tableRepository } from "@/modules/tables/table.repository";
import { accountRepository } from "./account.repository";
import type { AccountListFilter, CloseAccountInput } from "./account.types";

export class CloseAccountError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

const attentionChanged = "La atención de la mesa cambió. Actualizá la información e intentá nuevamente.";

function parseAttentionToken(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new CloseAccountError("Indicá una atención de mesa válida.");
  }
  return value.toLowerCase();
}

export const accountService = {
  async getClosedResult(atencionToken: string, usuarioCierreId: number) {
    const token = parseAttentionToken(atencionToken);
    return accountRepository.findClosedResultForUser(prisma, token, usuarioCierreId);
  },

  list(filter: AccountListFilter) {
    return accountRepository.list(prisma, filter);
  },

  async close(input: CloseAccountInput) {
    const atencionToken = parseAttentionToken(input.atencionToken);
    return prisma.$transaction(async (tx) => {
      await setOperationLockTimeout(tx);
      // The same table row coordinates orders, items, table release and billing.
      await tableRepository.lock(tx, input.mesaId);
      const mesa = await tableRepository.findById(tx, input.mesaId);
      if (!mesa || mesa.estado.codigo !== CODES.mesa.ocupada) {
        throw new CloseAccountError("Mesa inválida");
      }
      if (!mesa.atencionToken || mesa.atencionToken !== atencionToken) {
        throw new CloseAccountError(attentionChanged, 409);
      }

      // Preserve the established Mesa -> Pedido -> PedidoItem lock order.
      await orderRepository.lockActiveForTable(tx, input.mesaId);
      await orderRepository.lockActiveItemsForTable(tx, input.mesaId);
      const pedidos = await orderRepository.findActiveForAccount(tx, input.mesaId);
      if (pedidos.some((pedido) => pedido.atencionToken !== atencionToken)) {
        throw new CloseAccountError(attentionChanged, 409);
      }
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

      const metodoPagoValue = String(input.metodoPago || "").trim();
      const metodoPago = await accountRepository.findPaymentMethod(tx, metodoPagoValue);
      if (!metodoPago) throw new CloseAccountError("Método de pago inválido");
      const montoRecibido = metodoPago.requiereMontoRecibido ? Number(input.montoRecibido || 0) : total;
      if (!Number.isFinite(montoRecibido) || montoRecibido < total) {
        throw new CloseAccountError("El monto recibido no puede ser menor al total");
      }
      const vuelto = metodoPago.requiereMontoRecibido ? montoRecibido - total : 0;
      const pedidoFinalizado = await orderRepository.findOrderState(tx, CODES.pedido.finalizado);
      const mesaLibre = await tableRepository.findStateByCode(tx, CODES.mesa.libre);
      const cuentaCerrada = await accountRepository.findClosedState(tx);

      await orderRepository.finalizeActiveForTable(tx, input.mesaId, pedidoFinalizado.id, atencionToken);
      const created = await accountRepository.create(tx, {
        mesaId: input.mesaId,
        atencionToken,
        usuarioCierreId: input.usuarioCierreId,
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
      });
      await tableRepository.update(tx, input.mesaId, {
        estadoId: mesaLibre.id,
        atencionToken: null,
        abiertaAt: null,
        abiertaPor: null,
        revision: { increment: 1 }
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
};
