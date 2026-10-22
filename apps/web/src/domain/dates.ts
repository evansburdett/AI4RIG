/**
 * One date format across the app: "Oct 21, 2026", and with a time,
 * "Oct 21, 2026, 5:29 PM".
 */

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** An ISO timestamp, as date and time. */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

/** A YYYY-MM-DD day, read as that calendar day wherever the browser is. */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (year === undefined || month === undefined || date === undefined) return day;
  return DATE.format(new Date(year, month - 1, date));
}
