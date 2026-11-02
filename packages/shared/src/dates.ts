/** Dates are stored in UTC and shown in the user's time zone (default Europe/London), UK style: 2 Nov 2026. */
export const DEFAULT_TZ = 'Europe/London';

export function formatDate(value: string | Date | null | undefined, tz = DEFAULT_TZ): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz }).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined, tz = DEFAULT_TZ): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(value));
}

export function formatTime(value: string | Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(value));
}

/** The calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function dateKey(value: Date | string, tz = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz }).format(new Date(value));
  return parts;
}

/** Offset of a time zone from UTC at an instant, in minutes. */
function offsetMinutes(at: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The UTC instant of a wall-clock time (YYYY-MM-DD, hour, minute) in a time zone. */
export function zonedTime(day: string, hour: number, minute: number, tz = DEFAULT_TZ): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const guess = new Date(Date.UTC(y, m - 1, d, hour, minute));
  const first = new Date(guess.getTime() - offsetMinutes(guess, tz) * 60000);
  // Second pass settles the hour around clock changes.
  return new Date(guess.getTime() - offsetMinutes(first, tz) * 60000);
}

/** YYYY-MM-DD plus n days (calendar arithmetic, no time zone). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days between two YYYY-MM-DD dates (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function isWeekend(day: string): boolean {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}
