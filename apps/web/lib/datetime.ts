import { zonedTime } from '@jobsmith/shared';

/** <input type="datetime-local"> value for an instant, in the user's time zone. */
export function toLocalInput(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** The ISO instant for a datetime-local value typed in the user's time zone. */
export function fromLocalInput(value: string, tz: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  return m ? zonedTime(m[1]!, Number(m[2]), Number(m[3]), tz).toISOString() : null;
}
