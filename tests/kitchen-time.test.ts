import { describe, expect, it } from "vitest";
import { formatKitchenClock, formatKitchenElapsed, kitchenElapsedMinutes, kitchenTiming } from "../src/app/dashboard/kitchen-time";

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

describe("temporizador por pedido", () => {
  const created = "2026-11-09T12:00:00.000Z";
  const started = "2026-11-09T12:10:00.000Z";
  const base = { fechaHora: created, preparacionEstimadaMinutos: 10,
    preparacionIniciadaEn: started, preparacionFinalizadaEn: null };

  it("separa espera inicial de preparación", () => {
    const waiting = kitchenTiming({ ...base, estadoCocina: "Pendiente", preparacionIniciadaEn: null }, Date.parse(started));
    expect(waiting.phase).toBe("waiting");
    expect(waiting.waitMinutes).toBe(10);
    expect(waiting.preparationMinutes).toBeNull();
  });

  it("calcula tiempo restante y alerta desde el 70 %", () => {
    const order = { ...base, estadoCocina: "En preparacion" };
    const normal = kitchenTiming(order, Date.parse(started) + 6 * 60_000);
    expect(normal).toMatchObject({ preparationMinutes: 6, remainingMinutes: 4, progressPercent: 60, alert: "normal" });
    const near = kitchenTiming(order, Date.parse(started) + 7 * 60_000);
    expect(near).toMatchObject({ remainingMinutes: 3, progressPercent: 70, alert: "near" });
    const urgent = kitchenTiming(order, Date.parse(started) + 9 * 60_000);
    expect(urgent).toMatchObject({ remainingSeconds: 60, progressPercent: 90, alert: "urgent" });
    const overdue = kitchenTiming(order, Date.parse(started) + 11 * 60_000);
    expect(overdue).toMatchObject({ remainingMinutes: 0, remainingSeconds: 0, overdueSeconds: 60, progressPercent: 100, alert: "overdue" });
  });

  it("muestra segundos reales y cambia el cronómetro cada segundo", () => {
    const order = { ...base, estadoCocina: "En preparacion", preparacionEstimadaMinutos: 20 };
    const first = kitchenTiming(order, Date.parse(started) + 18_000);
    const second = kitchenTiming(order, Date.parse(started) + 19_000);
    expect(formatKitchenClock(first.remainingSeconds!)).toBe("19:42");
    expect(formatKitchenClock(second.remainingSeconds!)).toBe("19:41");
    expect(first.preparationSeconds).toBe(18);
    expect(formatKitchenClock(60 * 60 + 5)).toBe("60:05");
    expect(formatKitchenClock(-3)).toBe("00:00");
  });

  it("distingue los límites de aviso y no adelanta el estado por redondeo", () => {
    const order = { ...base, estadoCocina: "En preparacion" };
    const start = Date.parse(started);
    expect(kitchenTiming(order, start + 7 * 60_000 - 1000).alert).toBe("normal");
    expect(kitchenTiming(order, start + 7 * 60_000).alert).toBe("near");
    expect(kitchenTiming(order, start + 9 * 60_000 - 1000).alert).toBe("near");
    expect(kitchenTiming(order, start + 9 * 60_000).alert).toBe("urgent");
    expect(kitchenTiming(order, start + 10 * 60_000).alert).toBe("overdue");
  });

  it("una edición de estimación conserva los minutos transcurridos", () => {
    const now = Date.parse(started) + 8 * 60_000;
    const original = kitchenTiming({ ...base, estadoCocina: "En preparacion" }, now);
    const edited = kitchenTiming({ ...base, estadoCocina: "En preparacion", preparacionEstimadaMinutos: 20 }, now);
    expect(original.preparationMinutes).toBe(edited.preparationMinutes);
    expect(edited).toMatchObject({ remainingMinutes: 12, progressPercent: 40, alert: "normal" });
  });

  it("congela duración al pasar a Listo y cuenta aparte la espera de retiro", () => {
    const finished = "2026-11-09T12:18:00.000Z";
    const order = { ...base, estadoCocina: "Listo", preparacionFinalizadaEn: finished };
    const first = kitchenTiming(order, Date.parse(finished) + 2 * 60_000);
    const later = kitchenTiming(order, Date.parse(finished) + 5 * 60_000);
    expect(first).toMatchObject({ finalPreparationMinutes: 8, pickupMinutes: 2, alert: "normal" });
    expect(later).toMatchObject({ finalPreparationMinutes: 8, pickupMinutes: 5 });
    expect(first.finalPreparationSeconds).toBe(later.finalPreparationSeconds);
    expect(first.pickupSeconds).toBe(120);
    expect(later.pickupSeconds).toBe(300);
  });

  it("no inventa una hora de inicio para pedidos históricos", () => {
    const timing = kitchenTiming({ ...base, estadoCocina: "En preparacion", preparacionIniciadaEn: null }, Date.parse(started));
    expect(timing).toMatchObject({ preparationMinutes: null, remainingMinutes: null, progressPercent: null });
  });
});
