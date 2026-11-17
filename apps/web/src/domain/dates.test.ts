import { describe, expect, it } from 'vitest';

import { formatDay, groupByYearAndMonth } from './dates.js';

describe('formatDay', () => {
  it('shows a stored day the same way everywhere, without shifting it by time zone', () => {
    expect(formatDay('2026-10-21')).toBe('Oct 21, 2026');
    expect(formatDay('2026-01-01')).toBe('Jan 1, 2026');
  });
});

describe('groupByYearAndMonth', () => {
  it('files reports under year, then month, newest first (RIG, 11/17)', () => {
    // Local noon, so no time zone moves a report into another month.
    const at = (y: number, m: number, d: number) => ({ createdAt: new Date(y, m - 1, d, 12).toISOString() });
    const reports = [at(2027, 2, 3), at(2026, 11, 17), at(2026, 11, 2), at(2026, 8, 30)];
    const years = groupByYearAndMonth(reports, (r) => r.createdAt);
    expect(years.map((y) => [y.year, y.months.map((m) => [m.label, m.items.length])])).toEqual([
      [2027, [['February', 1]]],
      [2026, [['November', 2], ['August', 1]]],
    ]);
    expect(years[1]?.items).toHaveLength(3);
    expect(years[1]?.months[0]?.items[0]).toBe(reports[1]);
  });
});
