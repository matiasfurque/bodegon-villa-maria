import type { AccountWithRelations } from "./account.types";

function serializeMesa(mesa: AccountWithRelations["mesa"]) {
  return {
    ...mesa,
    estado: mesa.estado.nombre,
    estadoCodigo: mesa.estado.codigo,
    estadoPermitePedido: mesa.estado.permitePedido,
    estadoLiberaMesa: mesa.estado.liberaMesa
  };
}

export function serializeAccount(cuenta: AccountWithRelations) {
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
