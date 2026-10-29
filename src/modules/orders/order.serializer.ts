import type { OrderItemWithRelations, OrderWithRelations } from "./order.types";

function serializeMesa(mesa: OrderWithRelations["mesa"]) {
  return {
    ...mesa,
    estado: mesa.estado.nombre,
    estadoCodigo: mesa.estado.codigo,
    estadoPermitePedido: mesa.estado.permitePedido,
    estadoLiberaMesa: mesa.estado.liberaMesa
  };
}

export function serializeOrder(pedido: OrderWithRelations) {
  return {
    ...pedido,
    solicitudHash: undefined,
    atencionToken: pedido.atencionToken,
    estado: pedido.estado.nombre,
    estadoCodigo: pedido.estado.codigo,
    estadoActivo: pedido.estado.esActivo,
    estadoCocina: pedido.estadoCocina.nombre,
    estadoCocinaCodigo: pedido.estadoCocina.codigo,
    estadoCocinaPermiteAgregarItems: pedido.estadoCocina.permiteAgregarItems,
    estadoCocinaVisible: pedido.estadoCocina.visibleCocina,
    estadoCocinaNotificaMozo: pedido.estadoCocina.notificaMozo,
    items: pedido.items.map((item) => ({
      ...item,
      solicitudHash: undefined,
      anulado: Boolean(item.estado?.esAnulado),
      motivoAnulacion: item.motivoAnulacion?.nombre || item.motivoAnulacionDetalle || null
    })),
    mesa: pedido.mesa ? serializeMesa(pedido.mesa) : pedido.mesa
  };
}

export function serializeOrderItem(item: OrderItemWithRelations) {
  return {
    ...item,
    solicitudHash: undefined,
    anulado: item.estado.esAnulado,
    motivoAnulacion: item.motivoAnulacion?.nombre || item.motivoAnulacionDetalle || null
  };
}
