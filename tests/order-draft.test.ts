import { describe, expect, it } from "vitest";
import { readPendingOrderDraft, savePendingOrderDraft, type OrderDraftItem } from "@/modules/orders/order-draft";

const key = "bvm-order-draft:7:1";
const attention = { mesaId: 1, revision: 2, atencionToken: "22222222-2222-4222-8222-222222222222", occupied: true };
const item: OrderDraftItem = {
  draftId: "33333333-3333-4333-8333-333333333333",
  solicitudId: "33333333-3333-4333-8333-333333333333",
  targetPedidoId: 10,
  productoId: 5,
  nombre: "Producto",
  cantidad: 2,
  precio: 100,
  observacion: "Sin hielo"
};

describe("borrador de pedido pendiente", () => {
  it("conserva UUID, pedido de destino y atención al recargar", () => {
    const values = new Map<string, string>();
    const storage = {
      setItem: (name: string, value: string) => { values.set(name, value); },
      removeItem: (name: string) => { values.delete(name); }
    };
    savePendingOrderDraft(storage, key, attention, [item]);
    expect(readPendingOrderDraft(values.get(key) ?? null, 1)).toEqual({ attention, items: [item], creation: null });
    savePendingOrderDraft(storage, key, attention, []);
    expect(values.has(key)).toBe(false);
  });

  it("descarta datos corruptos o de otra mesa sin generar un UUID nuevo", () => {
    expect(readPendingOrderDraft("no-json", 1)).toBeNull();
    expect(readPendingOrderDraft(JSON.stringify({ attention, items: [item] }), 2)).toBeNull();
    expect(readPendingOrderDraft(JSON.stringify({ attention, items: [{ ...item, solicitudId: "no-uuid" }] }), 1)).toBeNull();
  });

  it("conserva la solicitud completa de creación y su UUID tras una respuesta incierta", () => {
    const values = new Map<string, string>();
    const storage = {
      setItem: (name: string, value: string) => { values.set(name, value); },
      removeItem: (name: string) => { values.delete(name); }
    };
    const creation = { solicitudId: "44444444-4444-4444-8444-444444444444",
      mesaId: 1, atencionToken: attention.atencionToken!, observacion: null,
      items: [{ productoId: 5, cantidad: 2, observacion: "Sin hielo" }] };
    savePendingOrderDraft(storage, key, attention, [item], creation);
    expect(readPendingOrderDraft(values.get(key) ?? null, 1)?.creation).toEqual(creation);
    expect(readPendingOrderDraft(values.get(key) ?? null, 1)?.items).toEqual([item]);
    const recovered = readPendingOrderDraft(values.get(key) ?? null, 1);
    expect(JSON.stringify(recovered?.creation)).toBe(JSON.stringify(creation));
    savePendingOrderDraft(storage, key, attention, [item], null);
    expect(readPendingOrderDraft(values.get(key) ?? null, 1)?.creation).toBeNull();
  });

  it("rechaza una creación corrupta sin sustituir automáticamente la atención ni el UUID", () => {
    const creation = { solicitudId: "44444444-4444-4444-8444-444444444444", mesaId: 1,
      atencionToken: attention.atencionToken!, observacion: null,
      items: [{ productoId: 5, cantidad: 1, observacion: "" }] };
    expect(readPendingOrderDraft(JSON.stringify({ attention, items: [item], creation: {
      ...creation, atencionToken: "77777777-7777-4777-8777-777777777777"
    } }), 1)).toBeNull();
    expect(readPendingOrderDraft(JSON.stringify({ attention, items: [item], creation: {
      ...creation, solicitudId: "no-uuid"
    } }), 1)).toBeNull();
  });
});
