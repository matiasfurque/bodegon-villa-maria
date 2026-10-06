import { NextRequest } from "next/server";
import { json, requirePermission, requireSession } from "@/lib/api";
import { CODES } from "@/lib/normalized";
import { tableService } from "@/modules/tables/table.service";
import type { TableWithRelations } from "@/modules/tables/table.types";

function serializeMesa(mesa: TableWithRelations) {
  return {
    ...mesa,
    estado: mesa.estado.nombre,
    estadoCodigo: mesa.estado.codigo,
    estadoPermitePedido: mesa.estado.permitePedido,
    estadoLiberaMesa: mesa.estado.liberaMesa,
    sector: mesa.sector?.nombre || null,
    activa: mesa.estado.codigo !== CODES.mesa.cerrada
  };
}

export async function GET(request: NextRequest) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const mesas = await tableService.list();
  return json(mesas.map(serializeMesa));
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const data = await request.json();
  const numero = Number(data.numero);
  const capacidad = Number(data.capacidad);
  if (!Number.isInteger(numero) || numero <= 0) {
    return json({ error: "Ingresá un número de mesa válido" }, 400);
  }
  if (!Number.isInteger(capacidad) || capacidad <= 0) {
    return json({ error: "Ingresá una capacidad válida" }, 400);
  }

  const result = await tableService.create({ ...data, numero, capacidad });
  if ("error" in result) return json({ error: result.error }, 400);
  return json(serializeMesa(result.mesa), result.created ? 201 : 200);
}
