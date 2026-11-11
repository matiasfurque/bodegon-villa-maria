export const DEFAULT_PREPARATION_ESTIMATE_MINUTES = 15;
export const PREPARATION_ESTIMATE_OPTIONS = [10, 15, 20, 30] as const;
export const MIN_PREPARATION_ESTIMATE_MINUTES = 5;
export const MAX_PREPARATION_ESTIMATE_MINUTES = 60;

export function validPreparationEstimate(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= MIN_PREPARATION_ESTIMATE_MINUTES && value <= MAX_PREPARATION_ESTIMATE_MINUTES;
}
