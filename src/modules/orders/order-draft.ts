export type OrderDraftItem = {
  draftId: string;
  solicitudId: string;
  targetPedidoId: number | null;
  productoId: number;
  nombre: string;
  cantidad: number;
  precio: number;
  observacion: string;
};

export type OrderAttention = {
  mesaId: number;
  revision: number;
  atencionToken: string | null;
  occupied: boolean;
};

export type PendingOrderCreation = {
  solicitudId: string;
  mesaId: number;
  atencionToken: string;
  observacion: string | null;
  items: Array<{ productoId: number; cantidad: number; observacion: string }>;
};

export type PendingOrderDraft = { attention: OrderAttention; items: OrderDraftItem[]; creation: PendingOrderCreation | null };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readPendingOrderDraft(raw: string | null, mesaId: number): PendingOrderDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PendingOrderDraft;
    if (!value || !value.attention || value.attention.mesaId !== mesaId ||
        !Number.isInteger(value.attention.revision) || value.attention.revision < 0 ||
        (value.attention.atencionToken !== null &&
          (typeof value.attention.atencionToken !== "string" || !uuidPattern.test(value.attention.atencionToken))) ||
        typeof value.attention.occupied !== "boolean" || !Array.isArray(value.items) ||
        !value.items.every((item) => item && typeof item.draftId === "string" &&
          typeof item.solicitudId === "string" && uuidPattern.test(item.solicitudId) &&
          (item.targetPedidoId === null || (Number.isInteger(item.targetPedidoId) && item.targetPedidoId > 0)) &&
          Number.isInteger(item.productoId) && item.productoId > 0 &&
          Number.isInteger(item.cantidad) && item.cantidad > 0 &&
          typeof item.nombre === "string" && Number.isFinite(item.precio) &&
          typeof item.observacion === "string")) return null;
    const creation = value.creation ?? null;
    if (creation && (!uuidPattern.test(creation.solicitudId) ||
        creation.mesaId !== mesaId || !uuidPattern.test(creation.atencionToken) ||
        creation.atencionToken !== value.attention.atencionToken ||
        (creation.observacion !== null && typeof creation.observacion !== "string") ||
        !Array.isArray(creation.items) || creation.items.length === 0 ||
        !creation.items.every((item) => Number.isInteger(item.productoId) && item.productoId > 0 &&
          Number.isInteger(item.cantidad) && item.cantidad > 0 && typeof item.observacion === "string"))) return null;
    return { ...value, creation };
  } catch {
    return null;
  }
}

export function savePendingOrderDraft(storage: Pick<Storage, "setItem" | "removeItem">,
  key: string, attention: OrderAttention | null, items: OrderDraftItem[], creation: PendingOrderCreation | null = null) {
  if ((items.length || creation) && attention) storage.setItem(key, JSON.stringify({ attention, items, creation }));
  else storage.removeItem(key);
}
