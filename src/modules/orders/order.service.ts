import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { CODES } from "@/lib/normalized";
import { prisma } from "@/lib/prisma";
import { setOperationLockTimeout } from "@/lib/transaction-lock";
import { tableRepository } from "@/modules/tables/table.repository";
import { orderRepository } from "./order.repository";
import type {
  AddOrderItemInput,
  CancelOrderItemInput,
  CreateOrderInput,
  UpdateOrderInput
} from "./order.types";

const nextKitchenStatus: Record<string, string> = {
  [CODES.cocina.pendiente]: CODES.cocina.enPreparacion,
  [CODES.cocina.enPreparacion]: CODES.cocina.listo,
  [CODES.cocina.listo]: CODES.cocina.entregado
};

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

const attentionConflict = {
  error: "La atención de la mesa cambió. Actualizá la información e intentá nuevamente.",
  status: 409
} as const;

const requestConflict = {
  error: "Esta solicitud ya se usó para otro producto o pedido. Revisá el borrador antes de continuar.",
  status: 409
} as const;

const orderRequestConflict = {
  error: "Esta solicitud ya se usó para crear otro pedido. Revisá el borrador antes de continuar.",
  status: 409
} as const;

function requestUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function itemRequestHash(pedidoId: number, data: AddOrderItemInput) {
  return createHash("sha256").update(JSON.stringify({
    pedidoId,
    atencionToken: typeof data.atencionToken === "string" ? data.atencionToken.toLowerCase() : data.atencionToken,
    productoId: Number(data.productoId),
    cantidad: Number(data.cantidad || 1),
    observacion: data.observacion || null
  })).digest("hex");
}

function orderRequestHash(input: CreateOrderInput) {
  return createHash("sha256").update(JSON.stringify({
    mesaId: Number(input.mesaId),
    usuarioId: Number(input.usuarioId),
    atencionToken: typeof input.atencionToken === "string" ? input.atencionToken.toLowerCase() : input.atencionToken,
    observacion: input.observacion || null,
    items: input.items.map((item) => ({
      productoId: Number(item.productoId),
      cantidad: Number(item.cantidad || 1),
      observacion: item.observacion || null
    }))
  })).digest("hex");
}

function checkTableAttention(received: unknown, current: string | null) {
  if (typeof received !== "string" || !received) {
    return { error: "Indicá la atención de la mesa.", status: 400 } as const;
  }
  if (!current || received !== current) return attentionConflict;
  return null;
}

function checkOrderAttention(received: unknown, mesaToken: string | null, pedidoToken: string | null) {
  const tableError = checkTableAttention(received, mesaToken);
  if (tableError) return tableError;
  if (!pedidoToken || pedidoToken !== mesaToken) return attentionConflict;
  return null;
}

function cancellationReasonCode(value: unknown) {
  const text = String(value || "").trim().toLowerCase();
  return text.includes("stock")
    ? CODES.motivoAnulacion.sinStock
    : text.includes("cliente")
      ? CODES.motivoAnulacion.clienteCancelo
      : text.includes("correcci")
        ? CODES.motivoAnulacion.correccionPedido
        : CODES.motivoAnulacion.otro;
}

export const orderService = {
  async list(mesaId: number | null) {
    const pedidos = await orderRepository.list(prisma, mesaId);
    return pedidos.filter((pedido) => pedido.mesa.atencionToken &&
      pedido.atencionToken === pedido.mesa.atencionToken);
  },

  create(input: CreateOrderInput) {
    const solicitudId = requestUuid(input.solicitudId);
    if (!solicitudId) return Promise.resolve({ error: "Indicá un identificador de solicitud válido.", status: 400 });
    if (typeof input.atencionToken !== "string" || !input.atencionToken) {
      return Promise.resolve({ error: "Indicá la atención de la mesa.", status: 400 });
    }
    const solicitudHash = orderRequestHash(input);
    return prisma.$transaction(async (tx) => {
      await setOperationLockTimeout(tx);
      await tableRepository.lock(tx, input.mesaId);
      const mesa = await tableRepository.findById(tx, input.mesaId);
      const previous = await orderRepository.findBySolicitudId(tx, solicitudId);
      if (previous) {
        return previous.solicitudHash === solicitudHash
          ? { pedido: previous, repeated: true }
          : orderRequestConflict;
      }
      if (!mesa || mesa.estado.codigo !== CODES.mesa.ocupada || !mesa.estado.permitePedido) {
        return { error: "La mesa debe estar ocupada para registrar pedidos" };
      }
      const attentionError = checkTableAttention(input.atencionToken, mesa.atencionToken);
      if (attentionError) return attentionError;

      const productIds = input.items.map((item) => Number(item.productoId));
      const products = await orderRepository.findSellableProducts(tx, productIds);
      const productMap = new Map(products.map((product) => [product.id, product]));
      const estado = await orderRepository.findOrderState(tx, CODES.pedido.activo);
      const estadoCocina = await orderRepository.findKitchenStateByCode(tx, CODES.cocina.pendiente);

      const pedido = await orderRepository.create(tx, {
        mesaId: input.mesaId,
        usuarioId: input.usuarioId,
        atencionToken: mesa.atencionToken,
        solicitudId,
        solicitudHash,
        estadoId: estado.id,
        estadoCocinaId: estadoCocina.id,
        observacion: input.observacion || null,
        items: {
          create: input.items.map((item) => {
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
      });
      return { pedido, repeated: false };
    }, transactionOptions).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return orderRequestConflict;
      throw error;
    });
  },

  update(pedidoId: number, data: UpdateOrderInput) {
    return prisma.$transaction(async (tx) => {
      await setOperationLockTimeout(tx);
      const lockedMesa = await tableRepository.lockForOrder(tx, pedidoId);
      await orderRepository.lockOrder(tx, pedidoId);

      const pedido = await orderRepository.findForMutation(tx, pedidoId);
      if (!pedido || pedido.mesaId !== lockedMesa[0]?.id) {
        return { error: "Solo se pueden modificar pedidos activos", status: 400 };
      }
      const attentionError = checkOrderAttention(data.atencionToken, pedido.mesa.atencionToken, pedido.atencionToken);
      if (attentionError) return attentionError;

      if (data.estadoCocina) {
        const expectedStatus = String(data.estadoCocinaEsperado || "").trim();
        if (!expectedStatus) return { error: "Indicá el estado de cocina esperado", status: 400 };
        if (expectedStatus !== pedido.estadoCocina.codigo &&
            expectedStatus.toLowerCase() !== pedido.estadoCocina.nombre.toLowerCase()) {
          return {
            error: "El estado del pedido cambió. Actualizá la información e intentá nuevamente.",
            status: 409
          };
        }
      }

      if (!pedido.estado.esActivo || pedido.mesa.estado.codigo !== CODES.mesa.ocupada ||
          !pedido.mesa.estado.permitePedido) {
        return { error: "Solo se pueden modificar pedidos activos", status: 400 };
      }

      const cuentaCerrada = await orderRepository.findClosedAccountDetail(tx, pedidoId);
      if (cuentaCerrada) return { error: "Solo se pueden modificar pedidos activos", status: 400 };

      const requestedStatus = String(data.estadoCocina || "").trim();
      const estadoCocina = data.estadoCocina
        ? await orderRepository.findKitchenState(tx, requestedStatus)
        : null;
      if (data.estadoCocina && !estadoCocina) return { error: "Estado de cocina invalido", status: 400 };
      if (estadoCocina && estadoCocina.codigo !== pedido.estadoCocina.codigo &&
          nextKitchenStatus[pedido.estadoCocina.codigo] !== estadoCocina.codigo) {
        return { error: `No se puede pasar de ${pedido.estadoCocina.nombre} a ${estadoCocina.nombre}`, status: 400 };
      }

      if (estadoCocina?.codigo === CODES.cocina.listo && pedido.estadoCocina.codigo !== CODES.cocina.listo) {
        if (!Number.isInteger(data.revisionContenidoEsperada) || Number(data.revisionContenidoEsperada) < 0) {
          return { error: "Indicá la revisión del contenido que estás viendo.", status: 400 };
        }
        if (data.revisionContenidoEsperada !== pedido.revisionContenido) {
          return { error: "El pedido recibió cambios mientras lo estabas preparando. Actualizá los productos antes de marcarlo como listo.", status: 409 };
        }
      }

      const observationChanged = data.observacion !== undefined && data.observacion !== pedido.observacion;

      const updated = await orderRepository.update(tx, pedidoId, {
        estadoCocinaId: estadoCocina?.id,
        observacion: data.observacion ?? pedido.observacion,
        ...(observationChanged ? { revisionContenido: { increment: 1 } } : {})
      });
      return { updated };
    }, transactionOptions);
  },

  addItem(pedidoId: number, data: AddOrderItemInput) {
    const solicitudId = requestUuid(data.solicitudId);
    if (!solicitudId) return Promise.resolve({ error: "Indicá un identificador de solicitud válido.", status: 400 });
    if (typeof data.atencionToken !== "string" || !data.atencionToken) {
      return Promise.resolve({ error: "Indicá la atención de la mesa.", status: 400 });
    }
    const solicitudHash = itemRequestHash(pedidoId, data);
    return prisma.$transaction(async (tx) => {
      await setOperationLockTimeout(tx);
      const lockedMesa = await tableRepository.lockForOrder(tx, pedidoId);
      await orderRepository.lockOrder(tx, pedidoId);
      const previous = await orderRepository.findItemBySolicitudId(tx, solicitudId);
      if (previous) {
        return previous.solicitudHash === solicitudHash
          ? { item: previous, repeated: true }
          : requestConflict;
      }
      const pedido = await orderRepository.findForMutation(tx, pedidoId);
      if (!pedido || pedido.mesaId !== lockedMesa[0]?.id) {
        return { error: "El pedido no puede modificarse" };
      }
      const attentionError = checkOrderAttention(data.atencionToken, pedido.mesa.atencionToken, pedido.atencionToken);
      if (attentionError) return attentionError;
      if (!pedido.estado.esActivo || pedido.mesa.estado.codigo !== CODES.mesa.ocupada ||
          !pedido.mesa.estado.permitePedido) {
        return { error: "El pedido no puede modificarse" };
      }
      if (!pedido.estadoCocina.permiteAgregarItems) {
        return { error: "El pedido ya esta cerrado para cocina. Creá un nuevo pedido." };
      }
      const product = await orderRepository.findSellableProduct(tx, Number(data.productoId));
      if (!product) return { error: "Producto inválido" };
      const cantidad = Number(data.cantidad || 1);
      if (cantidad <= 0) return { error: "La cantidad debe ser mayor a cero" };
      const precio = Number(product.precio);
      const item = await orderRepository.createItem(tx, {
        pedidoId,
        solicitudId,
        solicitudHash,
        productoId: product.id,
        cantidad,
        precioUnitario: precio,
        subtotal: precio * cantidad,
        observacion: data.observacion || null
      });
      await orderRepository.incrementContentRevision(tx, pedidoId);
      return { item, repeated: false };
    }, transactionOptions).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return requestConflict;
      throw error;
    });
  },

  cancelItem(itemId: number, input: CancelOrderItemInput) {
    const motivo = input.motivo || "Anulado por usuario";
    return prisma.$transaction(async (tx) => {
      await setOperationLockTimeout(tx);
      const lockedMesa = await tableRepository.lockForItem(tx, itemId);
      const lockedPedido = await orderRepository.lockOrderForItem(tx, itemId);
      await orderRepository.lockItem(tx, itemId);

      const item = await orderRepository.findItemForCancellation(tx, itemId);
      if (!item || item.pedidoId !== lockedPedido[0]?.id || item.pedido.mesaId !== lockedMesa[0]?.id) {
        return { error: "El item no puede anularse" };
      }
      const attentionError = checkOrderAttention(input.atencionToken, item.pedido.mesa.atencionToken, item.pedido.atencionToken);
      if (attentionError) return attentionError;
      if (!item.pedido.estado.esActivo || item.pedido.mesa.estado.codigo !== CODES.mesa.ocupada ||
          !item.pedido.mesa.estado.permitePedido) {
        return { error: "El item no puede anularse" };
      }
      if (item.estado.esAnulado) return { error: "El item ya fue anulado" };

      const cuentaCerrada = await orderRepository.findClosedAccountDetail(tx, item.pedidoId);
      if (cuentaCerrada) return { error: "El item no puede anularse" };

      const estadoAnulado = await orderRepository.findCancelledItemState(tx, CODES.item.anulado);
      const motivoCatalogo = await orderRepository.findCancellationReason(tx, cancellationReasonCode(motivo));

      const updated = await orderRepository.updateItem(tx, itemId, {
        estadoId: estadoAnulado.id,
        motivoAnulacionId: motivoCatalogo.id,
        motivoAnulacionDetalle: motivo
      });
      await orderRepository.incrementContentRevision(tx, item.pedidoId);
      return { updated };
    }, transactionOptions);
  }
};
