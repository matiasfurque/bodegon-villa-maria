import { NextRequest } from "next/server";
import { json, requirePermission } from "@/lib/api";
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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const { id } = await params;
  const data = await request.json();
  const result = await tableService.update(Number(id), data, auth.session?.userId);
  if ("error" in result) return json({ error: result.error }, 400);
  return json(serializeMesa(result.mesa));
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "operaciones.gestionar");
  if (auth.error) return auth.error;
  const { id } = await params;
  const result = await tableService.remove(Number(id));
  if ("error" in result) return json({ error: result.error }, 400);
  return json(serializeMesa(result.mesa));
}
