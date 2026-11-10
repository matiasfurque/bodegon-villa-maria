export const DEFAULT_KITCHEN_WAIT_MINUTES = 15;
export const KITCHEN_WAIT_OPTIONS = [10, 15, 20, 30] as const;

export function kitchenElapsedMinutes(createdAt: string, now: number): number | null {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return null;
  return Math.max(0, Math.floor((now - created) / 60_000));
}

export function formatKitchenElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

export function formatKitchenClock(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(wholeSeconds / 60)).padStart(2, "0")}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

type KitchenTimingInput = {
  estadoCocina: string;
  fechaHora: string;
  preparacionEstimadaMinutos: number | null;
  preparacionIniciadaEn: string | null;
  preparacionFinalizadaEn: string | null;
};

function elapsedMs(from: string | null, to: number): number | null {
  if (!from) return null;
  const start = Date.parse(from);
  return Number.isFinite(start) && Number.isFinite(to) ? Math.max(0, to - start) : null;
}

export function kitchenTiming(pedido: KitchenTimingInput, now: number) {
  const status = pedido.estadoCocina;
  const preparing = status === "En preparacion" || status === "COCINA_EN_PREPARACION";
  const pending = status === "Pendiente" || status === "COCINA_PENDIENTE";
  const ready = status === "Listo" || status === "COCINA_LISTO";
  const waitMs = pending ? elapsedMs(pedido.fechaHora, now) : null;
  const preparationMs = elapsedMs(pedido.preparacionIniciadaEn,
    pedido.preparacionFinalizadaEn ? Date.parse(pedido.preparacionFinalizadaEn) : now);
  const pickupMs = ready ? elapsedMs(pedido.preparacionFinalizadaEn, now) : null;
  const estimateMs = pedido.preparacionEstimadaMinutos !== null
    ? pedido.preparacionEstimadaMinutos * 60_000 : null;
  const progress = preparationMs !== null && estimateMs !== null && estimateMs > 0
    ? preparationMs / estimateMs : null;

  return {
    phase: pending ? "waiting" : preparing ? "preparing" : ready ? "pickup" : "delivered",
    waitMinutes: pending ? kitchenElapsedMinutes(pedido.fechaHora, now) : null,
    waitSeconds: waitMs === null ? null : Math.floor(waitMs / 1000),
    preparationMinutes: preparationMs === null ? null : Math.floor(preparationMs / 60_000),
    preparationSeconds: preparationMs === null ? null : Math.floor(preparationMs / 1000),
    finalPreparationMinutes: preparationMs === null || !pedido.preparacionFinalizadaEn
      ? null : Math.ceil(preparationMs / 60_000),
    finalPreparationSeconds: preparationMs === null || !pedido.preparacionFinalizadaEn
      ? null : Math.floor(preparationMs / 1000),
    pickupMinutes: pickupMs === null ? null : Math.floor(pickupMs / 60_000),
    pickupSeconds: pickupMs === null ? null : Math.floor(pickupMs / 1000),
    remainingMinutes: !preparing || estimateMs === null || preparationMs === null
      ? null : Math.max(0, Math.ceil((estimateMs - preparationMs) / 60_000)),
    remainingSeconds: !preparing || estimateMs === null || preparationMs === null
      ? null : Math.max(0, Math.ceil((estimateMs - preparationMs) / 1000)),
    overdueSeconds: !preparing || estimateMs === null || preparationMs === null
      ? null : Math.floor(Math.max(0, preparationMs - estimateMs) / 1000),
    progressPercent: progress === null ? null : Math.min(100, progress * 100),
    alert: !preparing || progress === null ? "normal" as const :
      progress >= 1 ? "overdue" as const : progress >= 0.9 ? "urgent" as const :
        progress >= 0.7 ? "near" as const : "normal" as const
  };
}
