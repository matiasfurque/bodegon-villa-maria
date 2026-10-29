export type PendingAccountClose = {
  mesa: { id: number; numero: number; descripcion?: string | null; estado: string; atencionToken: string };
  items: Array<{ id: number; pedidoId: number; producto: string; cantidad: number; precioUnitario: number; subtotal: number; observacion?: string | null }>;
  total: number;
  payment: { metodoPago: string; montoRecibido: number };
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readPendingAccountClose(raw: string | null): PendingAccountClose | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PendingAccountClose;
    if (!value || !value.mesa || !Number.isInteger(value.mesa.id) || value.mesa.id < 1 ||
        !Number.isInteger(value.mesa.numero) || typeof value.mesa.estado !== "string" ||
        typeof value.mesa.atencionToken !== "string" || !uuidPattern.test(value.mesa.atencionToken) ||
        !Number.isFinite(value.total) || value.total <= 0 || !Array.isArray(value.items) ||
        !value.items.every((item) => item && Number.isInteger(item.id) && Number.isInteger(item.pedidoId) &&
          typeof item.producto === "string" && Number.isInteger(item.cantidad) && item.cantidad > 0 &&
          Number.isFinite(item.precioUnitario) && Number.isFinite(item.subtotal)) ||
        !value.payment || typeof value.payment.metodoPago !== "string" ||
        !Number.isFinite(value.payment.montoRecibido)) return null;
    return value;
  } catch {
    return null;
  }
}

export function savePendingAccountClose(storage: Pick<Storage, "setItem" | "removeItem">,
  key: string, pending: PendingAccountClose | null) {
  if (pending) storage.setItem(key, JSON.stringify(pending));
  else storage.removeItem(key);
}
