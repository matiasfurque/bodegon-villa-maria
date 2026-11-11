import { kitchenTiming } from "./kitchen-time";

export type KitchenStartPreview = {
  requestId: number;
  atencionToken: string | null;
  startedAt: number;
  estimateMinutes: number;
};

export function addKitchenStartPreview(
  current: Record<number, KitchenStartPreview>, pedidoId: number, preview: KitchenStartPreview
) {
  return current[pedidoId] ? current : { ...current, [pedidoId]: preview };
}

export function removeKitchenStartPreview(
  current: Record<number, KitchenStartPreview>, pedidoId: number, requestId: number
) {
  if (current[pedidoId]?.requestId !== requestId) return current;
  const next = { ...current };
  delete next[pedidoId];
  return next;
}

type KitchenStartOrder = {
  estadoCocina: string;
  atencionToken: string | null;
};

export function visibleKitchenStartPreview(order: KitchenStartOrder, preview?: KitchenStartPreview) {
  return preview && preview.atencionToken !== null && order.atencionToken === preview.atencionToken &&
    order.estadoCocina === "Pendiente" ? preview : null;
}

export function kitchenStartPreviewTiming(preview: KitchenStartPreview, now: number) {
  return kitchenTiming({
    estadoCocina: "En preparacion",
    fechaHora: new Date(preview.startedAt).toISOString(),
    preparacionEstimadaMinutos: preview.estimateMinutes,
    preparacionIniciadaEn: new Date(preview.startedAt).toISOString(),
    preparacionFinalizadaEn: null
  }, now);
}

export function canApplyKitchenStartResponse(
  current: KitchenStartOrder,
  confirmed: KitchenStartOrder,
  preview: KitchenStartPreview
) {
  return visibleKitchenStartPreview(current, preview) !== null &&
    confirmed.atencionToken === preview.atencionToken && confirmed.estadoCocina === "En preparacion";
}
