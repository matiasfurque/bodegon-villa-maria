import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { CODES } from "@/lib/normalized";
import { prisma } from "@/lib/prisma";
import { setOperationLockTimeout } from "@/lib/transaction-lock";
import { tableRepository } from "./table.repository";
import type { TableCreateInput, TableExpectedIdentity, TableUpdateInput, TableWithRelations } from "./table.types";

const changedMessage = "La mesa cambió. Actualizá la información e intentá nuevamente.";
const legacyMessage = "Esta mesa ocupada no tiene una atención identificada. Requiere una transición controlada antes de modificarla.";

function checkExpected(current: TableWithRelations, input: TableExpectedIdentity) {
  if (!Number.isInteger(input.revisionEsperada) || Number(input.revisionEsperada) < 0) {
    return { error: "Indicá la revisión de la mesa que estás viendo.", status: 400 };
  }
  if (current.revision !== input.revisionEsperada) return { error: changedMessage, status: 409 };
  if (current.estado.codigo === CODES.mesa.ocupada && !current.atencionToken) {
    return { error: legacyMessage, status: 409 };
  }
  if (current.atencionToken !== (input.atencionTokenEsperado ?? null)) {
    return { error: changedMessage, status: 409 };
  }
  return null;
}

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
    await setOperationLockTimeout(tx);
    await tableRepository.lock(tx, id);
    return action(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function activeOrdersBlock(tx: Prisma.TransactionClient, current: TableWithRelations, action: "release" | "remove") {
  const activeOrders = await tableRepository.countActiveOrders(tx, current.id);
  if (activeOrders === 0) return null;
  if (!current.atencionToken || await tableRepository.findForeignActiveOrder(tx, current.id, current.atencionToken)) {
    return { error: "La mesa tiene pedidos activos de otra atención. Revisá el historial antes de continuar.", status: 409 };
  }
  if (action === "remove" || await tableRepository.countActiveOrdersWithItems(tx, current.id, current.atencionToken) > 0) {
    return { error: activeOrdersError[action] };
  }

  // All items were annulled: close the empty orders before releasing the table.
  const annulled = await tableRepository.findOrderStateByCode(tx, CODES.pedido.anulado);
  await tableRepository.cancelActiveOrders(tx, current.id, annulled.id, current.atencionToken);
  return null;
}

export const tableService = {
  list() {
    return tableRepository.list(prisma);
  },

  async create(input: TableCreateInput, userId?: number) {
    const existing = await tableRepository.findIdByNumber(prisma, input.numero);
    if (existing) {
      return withLockedTable(existing.id, async (tx) => {
        const current = await tableRepository.findByIdOrThrow(tx, existing.id);
        if (current.numero !== input.numero) {
          return { error: "No se pudo crear la mesa. Revisá que el número no exista." };
        }
        const conflict = checkExpected(current, input);
        if (conflict) return conflict;
        const estado = current.estado.codigo === CODES.mesa.cerrada
          ? await tableRepository.findStateByCode(tx, CODES.mesa.libre)
          : current.estado;
        if (estado.codigo === CODES.mesa.libre) {
          const blocked = await activeOrdersBlock(tx, current, "release");
          if (blocked) return blocked;
        }
        const descripcion = input.descripcion || current.descripcion;
        const changed = current.capacidad !== input.capacidad || current.descripcion !== descripcion ||
          current.sector?.nombre !== sectorName(descripcion) || current.estadoId !== estado.id;
        if (!changed) return { mesa: current, created: false };
        const sector = await tableRepository.upsertSector(tx, sectorName(descripcion));
        const mesa = await tableRepository.update(tx, current.id, {
          capacidad: input.capacidad, descripcion, sectorId: sector.id, estadoId: estado.id,
          ...(current.estadoId !== estado.id ? { atencionToken: null, abiertaAt: null, abiertaPor: null } : {}),
          revision: { increment: 1 }
        });
        return { mesa, created: false };
      });
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const estado = await tableRepository.findState(tx, stateText(input.estado), CODES.mesa.libre);
        const sector = await tableRepository.upsertSector(tx, sectorName(input.descripcion));
        const mesa = await tableRepository.create(tx, {
          numero: input.numero,
          capacidad: input.capacidad,
          descripcion: input.descripcion || null,
          sectorId: sector.id,
          estadoId: estado.id,
          ...(estado.codigo === CODES.mesa.ocupada ? {
            atencionToken: randomUUID(), abiertaAt: new Date(), abiertaPor: userId,
            revision: 1
          } : {})
        });
        return { mesa, created: true };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { error: "No se pudo crear la mesa. Revisá que el número no exista." };
      }
      throw error;
    }
  },

  async update(id: number, input: TableUpdateInput, userId?: number) {
    return withLockedTable(id, async (tx) => {
      const current = await tableRepository.findByIdOrThrow(tx, id);
      const conflict = checkExpected(current, input);
      if (conflict) return conflict;
      const estado = input.estado === undefined ? current.estado : await tableRepository.findState(tx, stateText(input.estado), CODES.mesa.libre);
      const stateChanged = current.estadoId !== estado.id;
      if (stateChanged && estado.codigo === CODES.mesa.ocupada && current.estado.codigo !== CODES.mesa.libre) {
        return { error: "La mesa debe estar libre antes de ocuparla." };
      }
      if (stateChanged && (estado.codigo === CODES.mesa.libre || estado.codigo === CODES.mesa.cerrada)) {
        const blocked = await activeOrdersBlock(tx, current, estado.codigo === CODES.mesa.libre ? "release" : "remove");
        if (blocked) return blocked;
      }
      const descripcion = input.descripcion === undefined ? current.descripcion : input.descripcion;
      const numero = input.numero === undefined ? current.numero : Number(input.numero);
      const capacidad = input.capacidad === undefined ? current.capacidad : Number(input.capacidad);
      const sectorChanged = input.descripcion !== undefined && current.sector?.nombre !== sectorName(input.descripcion);
      const changed = stateChanged || current.numero !== numero || current.capacidad !== capacidad ||
        current.descripcion !== descripcion || sectorChanged;
      if (!changed) return { mesa: current };
      const sector = sectorChanged ? await tableRepository.upsertSector(tx, sectorName(input.descripcion)) : null;
      const opening = stateChanged && estado.codigo === CODES.mesa.ocupada;
      const ending = stateChanged && (estado.codigo === CODES.mesa.libre || estado.codigo === CODES.mesa.cerrada);
      const mesa = await tableRepository.update(tx, id, {
        numero: input.numero === undefined ? undefined : numero,
        capacidad: input.capacidad === undefined ? undefined : capacidad,
        descripcion: input.descripcion === undefined ? undefined : descripcion,
        sectorId: sector?.id,
        estadoId: stateChanged ? estado.id : undefined,
        atencionToken: opening ? randomUUID() : ending ? null : undefined,
        abiertaAt: opening ? new Date() : ending ? null : undefined,
        abiertaPor: opening ? userId : ending ? null : undefined,
        revision: { increment: 1 }
      });
      return { mesa };
    });
  },

  async remove(id: number, input: TableExpectedIdentity) {
    return withLockedTable(id, async (tx) => {
      const current = await tableRepository.findByIdOrThrow(tx, id);
      const conflict = checkExpected(current, input);
      if (conflict) return conflict;
      const cerrada = await tableRepository.findStateByCode(tx, CODES.mesa.cerrada);
      if (current.estadoId === cerrada.id) return { mesa: current };
      const blocked = await activeOrdersBlock(tx, current, "remove");
      if (blocked) return blocked;
      const mesa = await tableRepository.update(tx, id, {
        estadoId: cerrada.id, atencionToken: null, abiertaAt: null, abiertaPor: null,
        revision: { increment: 1 }
      });
      return { mesa };
    });
  }
};
