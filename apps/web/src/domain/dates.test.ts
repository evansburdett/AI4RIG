import { describe, expect, it } from 'vitest';

import { formatDay } from './dates.js';

describe('formatDay', () => {
  it('shows a stored day the same way everywhere, without shifting it by time zone', () => {
    expect(formatDay('2026-10-21')).toBe('Oct 21, 2026');
    expect(formatDay('2026-01-01')).toBe('Jan 1, 2026');
  });
});
