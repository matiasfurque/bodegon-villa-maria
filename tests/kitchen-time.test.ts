import { describe, expect, it } from "vitest";
import { formatKitchenElapsed, kitchenElapsedMinutes } from "../src/app/dashboard/kitchen-time";

describe("antigüedad de pedidos en Cocina", () => {
  const created = "2026-10-31T12:00:00.000Z";

  it("calcula minutos transcurridos y permite evaluar el umbral exacto", () => {
    expect(kitchenElapsedMinutes(created, Date.parse(created) + 14 * 60_000)).toBe(14);
    expect(kitchenElapsedMinutes(created, Date.parse(created) + 15 * 60_000)).toBe(15);
  });

  it("no muestra tiempos negativos ni inventa tiempos con fechas inválidas", () => {
    expect(kitchenElapsedMinutes(created, Date.parse(created) - 60_000)).toBe(0);
    expect(kitchenElapsedMinutes("invalid", Date.now())).toBeNull();
  });

  it("presenta minutos y horas de forma legible", () => {
    expect(formatKitchenElapsed(0)).toBe("0 min");
    expect(formatKitchenElapsed(65)).toBe("1 h 5 min");
  });
});
