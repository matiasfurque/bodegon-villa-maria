import { Prisma } from "@prisma/client";
import { CODES } from "@/lib/normalized";
import { prisma } from "@/lib/prisma";
import { tableRepository } from "./table.repository";
import type { TableCreateInput, TableUpdateInput } from "./table.types";

const activeOrdersError = {
  release: "No se puede liberar una mesa con pedidos activos. Cerrá la cuenta para dejarla libre.",
  remove: "No se puede dar de baja una mesa con pedidos activos. Cerrá la cuenta antes."
};

function stateText(value: unknown) {
  return String(value || "").trim();
}

function sectorName(value: unknown) {
  return String(value || "").trim() || "General";
}

function withLockedTable<T>(id: number, action: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tableRepository.lock(tx, id);
    return action(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function activeOrdersBlock(tx: Prisma.TransactionClient, mesaId: number, action: "release" | "remove") {
  const activeOrders = await tableRepository.countActiveOrders(tx, mesaId);
  return activeOrders > 0 ? { error: activeOrdersError[action] } : null;
}

export const tableService = {
  list() {
    return tableRepository.list(prisma);
  },

  async create(input: TableCreateInput) {
    const existing = await tableRepository.findByNumber(prisma, input.numero);
    if (existing) {
      const sector = await tableRepository.upsertSector(prisma, sectorName(input.descripcion || existing.descripcion));
      return withLockedTable(existing.id, async (tx) => {
        const current = await tableRepository.findByIdOrThrow(tx, existing.id);
        const estado = existing.estado.codigo === CODES.mesa.cerrada && current.estado.codigo === CODES.mesa.cerrada
          ? await tableRepository.findStateByCode(tx, CODES.mesa.libre)
          : current.estado;
        if (estado.codigo === CODES.mesa.libre) {
          const blocked = await activeOrdersBlock(tx, current.id, "release");
          if (blocked) return blocked;
        }
        const mesa = await tableRepository.update(tx, current.id, {
          capacidad: input.capacidad,
          descripcion: input.descripcion || existing.descripcion,
          sectorId: sector.id,
          estadoId: estado.id
        });
        return { mesa, created: false };
      });
    }

    try {
      const estado = await tableRepository.findState(prisma, stateText(input.estado), CODES.mesa.libre);
      const sector = await tableRepository.upsertSector(prisma, sectorName(input.descripcion));
      const mesa = await tableRepository.create(prisma, {
        numero: input.numero,
        capacidad: input.capacidad,
        descripcion: input.descripcion || null,
        sectorId: sector.id,
        estadoId: estado.id
      });
      return { mesa, created: true };
    } catch {
      return { error: "No se pudo crear la mesa. Revisá que el número no exista." };
    }
  },

  async update(id: number, input: TableUpdateInput, userId?: number) {
    const estado = input.estado === undefined ? null : await tableRepository.findState(prisma, stateText(input.estado), CODES.mesa.libre);
    const sector = input.descripcion === undefined ? null : await tableRepository.upsertSector(prisma, sectorName(input.descripcion));

    return withLockedTable(id, async (tx) => {
      if (estado?.codigo === CODES.mesa.libre || estado?.codigo === CODES.mesa.cerrada) {
        const blocked = await activeOrdersBlock(tx, id, estado.codigo === CODES.mesa.libre ? "release" : "remove");
        if (blocked) return blocked;
      }

      const mesa = await tableRepository.update(tx, id, {
        numero: input.numero === undefined ? undefined : Number(input.numero),
        capacidad: input.capacidad === undefined ? undefined : Number(input.capacidad),
        descripcion: input.descripcion,
        sectorId: sector?.id,
        estadoId: estado?.id,
        abiertaAt: estado?.codigo === CODES.mesa.ocupada ? new Date() : estado?.codigo === CODES.mesa.libre ? null : undefined,
        abiertaPor: estado?.codigo === CODES.mesa.ocupada ? userId : estado?.codigo === CODES.mesa.libre ? null : undefined
      });
      return { mesa };
    });
  },

  async remove(id: number) {
    const cerrada = await tableRepository.findState(prisma, CODES.mesa.cerrada, CODES.mesa.libre);
    return withLockedTable(id, async (tx) => {
      const blocked = await activeOrdersBlock(tx, id, "remove");
      if (blocked) return blocked;
      const mesa = await tableRepository.update(tx, id, { estadoId: cerrada.id });
      return { mesa };
    });
  }
};
