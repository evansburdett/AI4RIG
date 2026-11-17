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

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long' });

export interface MonthGroup<T> {
  /** 1 to 12. */
  readonly month: number;
  readonly label: string;
  readonly items: readonly T[];
}

export interface YearGroup<T> {
  readonly year: number;
  readonly items: readonly T[];
  readonly months: readonly MonthGroup<T>[];
}

/**
 * Items with an ISO timestamp, by year and then month in local time, newest
 * first. Within a month the items keep the order they came in.
 */
export function groupByYearAndMonth<T>(items: readonly T[], when: (item: T) => string): YearGroup<T>[] {
  const years = new Map<number, Map<number, T[]>>();
  for (const item of items) {
    const date = new Date(when(item));
    const months = years.get(date.getFullYear()) ?? new Map<number, T[]>();
    years.set(date.getFullYear(), months);
    const list = months.get(date.getMonth() + 1) ?? [];
    months.set(date.getMonth() + 1, list);
    list.push(item);
  }
  return [...years.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, months]) => {
      const monthGroups = [...months.entries()]
        .sort(([a], [b]) => b - a)
        .map(([month, list]) => ({ month, label: MONTH.format(new Date(year, month - 1, 1)), items: list }));
      return { year, months: monthGroups, items: monthGroups.flatMap((m) => m.items) };
    });
}
