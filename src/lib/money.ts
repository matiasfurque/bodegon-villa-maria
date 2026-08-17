export function money(value: number | string | { toString: () => string }) {
  const number = Number(value.toString());
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(number);
}
