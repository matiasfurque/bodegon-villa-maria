import { describe, expect, it } from "vitest";
import { readPendingAccountClose, savePendingAccountClose, type PendingAccountClose } from "@/modules/accounts/account-pending";

const original: PendingAccountClose = {
  mesa: { id: 4, numero: 4, descripcion: "Patio", estado: "Ocupada", atencionToken: "11111111-1111-4111-8111-111111111111" },
  items: [{ id: 9, pedidoId: 3, producto: "Plato", cantidad: 2, precioUnitario: 5000, subtotal: 10000 }],
  total: 10000,
  payment: { metodoPago: "Efectivo", montoRecibido: 12000 }
};

describe("cobro pendiente en la pestaña", () => {
  it("conserva token original, importe, ítems y medio de pago tras recarga", () => {
    const values = new Map<string, string>();
    const storage = { setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); } };
    const key = "bvm-pending-account-close:7";
    savePendingAccountClose(storage, key, original);
    const restored = readPendingAccountClose(values.get(key) ?? null);
    expect(restored).toEqual(original);
    expect(restored?.mesa.atencionToken).toBe(original.mesa.atencionToken);
    savePendingAccountClose(storage, key, null);
    expect(values.has(key)).toBe(false);
  });

  it("rechaza borradores corruptos sin cambiar por una atención nueva", () => {
    expect(readPendingAccountClose("mal-json")).toBeNull();
    expect(readPendingAccountClose(JSON.stringify({ ...original, mesa: { ...original.mesa, atencionToken: "otro" } }))).toBeNull();
    expect(readPendingAccountClose(JSON.stringify({ ...original, payment: null }))).toBeNull();
  });
});
