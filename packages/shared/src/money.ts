/** Salaries are integer pence per year with a currency (project rule 6). */
export const CURRENCIES = ['GBP', 'EUR', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

const SYMBOL: Record<Currency, string> = { GBP: '£', EUR: '€', USD: '$' };

export function formatSalary(pence: number | null | undefined, currency: string = 'GBP'): string {
  if (pence == null) return '';
  const symbol = SYMBOL[currency as Currency] ?? `${currency} `;
  const pounds = Math.round(pence / 100);
  return `${symbol}${pounds.toLocaleString('en-GB')}`;
}

export function formatSalaryRange(min: number | null | undefined, max: number | null | undefined, currency = 'GBP'): string {
  if (min == null && max == null) return '';
  if (min != null && max != null && min !== max) return `${formatSalary(min, currency)} – ${formatSalary(max, currency)}`;
  return formatSalary(min ?? max, currency);
}

/** Annual pence from an amount and period. Hourly assumes 37.5 hours × 52 weeks, daily 5 × 52 (ASSUMPTIONS.md). */
export function toAnnualPence(amount: number, period: 'YEAR' | 'MONTH' | 'WEEK' | 'DAY' | 'HOUR'): number {
  const factor = { YEAR: 1, MONTH: 12, WEEK: 52, DAY: 5 * 52, HOUR: 37.5 * 52 }[period];
  return Math.round(amount * factor * 100);
}
