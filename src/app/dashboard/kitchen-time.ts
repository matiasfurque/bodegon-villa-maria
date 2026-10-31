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
