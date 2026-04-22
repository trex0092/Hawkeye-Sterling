import { describe, expect, it } from 'vitest';
import { addBusinessDays, isBusinessDay, defaultUaeCalendar, isWeekend } from '../calendar.js';

describe('UAE calendar', () => {
  it('Saturday and Sunday are weekend', () => {
    const sat = new Date('2026-04-25T12:00:00Z');
    const sun = new Date('2026-04-26T12:00:00Z');
    const mon = new Date('2026-04-27T12:00:00Z');
    expect(isWeekend(sat)).toBe(true);
    expect(isWeekend(sun)).toBe(true);
    expect(isWeekend(mon)).toBe(false);
  });

  it('skips weekends when adding business days', () => {
    const thu = new Date('2026-04-23T12:00:00Z');
    const plus2 = addBusinessDays(thu, 2);
    expect(plus2.getUTCDate()).toBe(28); // Tue 28 Apr (skip Sat 25 / Sun 26)
  });

  it('treats configured holidays as non-business days', () => {
    const cfg = defaultUaeCalendar();
    const natDay = new Date('2026-12-02T12:00:00Z');
    expect(isBusinessDay(natDay, cfg)).toBe(false);
  });
});
