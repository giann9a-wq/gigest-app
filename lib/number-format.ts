const IT_NUMBER_FORMATTER = new Intl.NumberFormat("it-IT", {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatNumber(value: number | null | undefined) {
  return IT_NUMBER_FORMATTER.format(value ?? 0);
}

export function formatCurrency(value: number | null | undefined) {
  return `${formatNumber(value)} €`;
}

export function formatPercent(value: number | null | undefined) {
  return `${formatNumber(value)} %`;
}

export function formatQuantity(value: number | null | undefined, suffix: string) {
  return `${formatNumber(value)} ${suffix}`;
}
