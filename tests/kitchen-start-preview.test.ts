import { describe, expect, it } from "vitest";
import { addKitchenStartPreview, canApplyKitchenStartResponse, kitchenStartPreviewTiming,
  removeKitchenStartPreview, visibleKitchenStartPreview } from "../src/app/dashboard/kitchen-start-preview";
import { formatKitchenClock } from "../src/app/dashboard/kitchen-time";

describe("inicio provisional de Cocina, aislado del pedido confirmado", () => {
  const startedAt = Date.parse("2026-11-10T12:00:00.000Z");
  const preview = { requestId: 1, atencionToken: "atencion-a", startedAt, estimateMinutes: 20 };
  const pending = { estadoCocina: "Pendiente", atencionToken: "atencion-a" };

  it("muestra la cuenta regresiva local desde el clic y descuenta cada segundo", () => {
    const original = { ...pending };
    expect(visibleKitchenStartPreview(pending, preview)).toEqual(preview);
    expect(formatKitchenClock(kitchenStartPreviewTiming(preview, startedAt).remainingSeconds!)).toBe("20:00");
    expect(formatKitchenClock(kitchenStartPreviewTiming(preview, startedAt + 1000).remainingSeconds!)).toBe("19:59");
    expect(pending).toEqual(original);
  });

  it("no muestra el contador provisional en otra atención o tras un estado oficial", () => {
    expect(visibleKitchenStartPreview({ ...pending, atencionToken: "atencion-b" }, preview)).toBeNull();
    expect(visibleKitchenStartPreview({ ...pending, estadoCocina: "En preparacion" }, preview)).toBeNull();
    expect(visibleKitchenStartPreview(pending, { ...preview, atencionToken: null })).toBeNull();
  });

  it("impide un segundo inicio local y limpia solo la solicitud que terminó", () => {
    const first = addKitchenStartPreview({}, 7, preview);
    const duplicate = addKitchenStartPreview(first, 7, { ...preview, requestId: 2 });
    expect(duplicate).toBe(first);
    expect(removeKitchenStartPreview(first, 7, 2)).toBe(first);
    expect(removeKitchenStartPreview(first, 7, 1)).toEqual({});
  });

  it("mantiene independientes los contadores de otros pedidos y navegadores", () => {
    const oneBrowser = addKitchenStartPreview({}, 7, preview);
    const anotherBrowser = addKitchenStartPreview({}, 7, { ...preview, requestId: 9, startedAt: startedAt + 2000 });
    expect(removeKitchenStartPreview(oneBrowser, 7, 1)).toEqual({});
    expect(anotherBrowser[7]?.requestId).toBe(9);
    const twoOrders = addKitchenStartPreview(oneBrowser, 8, { ...preview, requestId: 3 });
    expect(removeKitchenStartPreview(twoOrders, 7, 1)[8]?.requestId).toBe(3);
  });

  it("reconcilia solo con la respuesta de la misma atención y evita pisar un estado más reciente", () => {
    const confirmed = { estadoCocina: "En preparacion", atencionToken: "atencion-a" };
    expect(canApplyKitchenStartResponse(pending, confirmed, preview)).toBe(true);
    expect(canApplyKitchenStartResponse({ ...pending, estadoCocina: "Listo" }, confirmed, preview)).toBe(false);
    expect(canApplyKitchenStartResponse({ ...pending, atencionToken: "atencion-b" }, confirmed, preview)).toBe(false);
    expect(canApplyKitchenStartResponse(pending, { ...confirmed, atencionToken: "atencion-b" }, preview)).toBe(false);
  });

  it("usa la estimación capturada al iniciar sin cambiar la duración oficial", () => {
    const original = kitchenStartPreviewTiming(preview, startedAt + 30_000);
    const edited = kitchenStartPreviewTiming({ ...preview, estimateMinutes: 30 }, startedAt + 30_000);
    expect(original.preparationSeconds).toBe(edited.preparationSeconds);
    expect(original.remainingSeconds).toBe(1170);
    expect(edited.remainingSeconds).toBe(1770);
  });
});
