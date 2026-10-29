import { CODES } from "@/lib/normalized";
import type { TableWithRelations } from "./table.types";

export function serializeMesa(mesa: TableWithRelations) {
  return {
    id: mesa.id,
    numero: mesa.numero,
    descripcion: mesa.descripcion,
    capacidad: mesa.capacidad,
    estadoId: mesa.estadoId,
    sectorId: mesa.sectorId,
    abiertaAt: mesa.abiertaAt,
    abiertaPor: mesa.abiertaPor,
    createdAt: mesa.createdAt,
    updatedAt: mesa.updatedAt,
    revision: mesa.revision,
    atencionToken: mesa.atencionToken,
    estado: mesa.estado.nombre,
    estadoCodigo: mesa.estado.codigo,
    estadoPermitePedido: mesa.estado.permitePedido,
    estadoLiberaMesa: mesa.estado.liberaMesa,
    sector: mesa.sector?.nombre || null,
    activa: mesa.estado.codigo !== CODES.mesa.cerrada
  };
}
