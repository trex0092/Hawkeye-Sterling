// Hawkeye Sterling — UAE business-day calendar.
// UAE weekend: Saturday + Sunday (post-2022 reform). Public holidays are
// provided as a seed list that Phase-2 can refresh from the UAE Government
// Portal annually.
//
// Used by FFR / PNMR / STR deadline computation (filings.ts) and KPI SLAs.

export type DateIso = string; // YYYY-MM-DD

export interface CalendarConfig {
  weekend: number[]; // 0 = Sunday, 6 = Saturday
  holidays: Set<DateIso>;
}

const DEFAULT_HOLIDAYS_2026: DateIso[] = [
  '2026-01-01', // New Year's Day
  '2026-03-20', // Eid Al Fitr (indicative; subject to moon sighting)
  '2026-03-21',
  '2026-03-22',
  '2026-05-27', // Arafat Day (indicative)
  '2026-05-28', // Eid Al Adha (indicative)
  '2026-05-29',
  '2026-05-30',
  '2026-06-17', // Hijri New Year (indicative)
  '2026-08-26', // Prophet’s Birthday (indicative)
  '2026-12-01', // Commemoration Day
  '2026-12-02', // UAE National Day
  '2026-12-03',
];

export function defaultUaeCalendar(): CalendarConfig {
  return {
    weekend: [0, 6],
    holidays: new Set<DateIso>(DEFAULT_HOLIDAYS_2026),
  };
}

function toIso(d: Date): DateIso {
  return d.toISOString().slice(0, 10);
}

export function isWeekend(d: Date, cfg: CalendarConfig = defaultUaeCalendar()): boolean {
  return cfg.weekend.includes(d.getUTCDay());
}

export function isHoliday(d: Date, cfg: CalendarConfig = defaultUaeCalendar()): boolean {
  return cfg.holidays.has(toIso(d));
}

export function isBusinessDay(d: Date, cfg: CalendarConfig = defaultUaeCalendar()): boolean {
  return !isWeekend(d, cfg) && !isHoliday(d, cfg);
}

// "Within n business days" in UAE filing semantics = the first calendar day
// ON WHICH n full business days have elapsed since `start`. So addBusinessDays
// steps through n business days and then advances one more calendar day — the
// returned date is the deadline boundary (start-of-that-day is the cutoff).
export function addBusinessDays(
  start: Date,
  n: number,
  cfg: CalendarConfig = defaultUaeCalendar(),
): Date {
  const out = new Date(start.getTime());
  if (n === 0) return out;
  let added = 0;
  const step = n >= 0 ? 1 : -1;
  const target = Math.abs(n);
  while (added < target) {
    out.setUTCDate(out.getUTCDate() + step);
    if (isBusinessDay(out, cfg)) added++;
  }
  out.setUTCDate(out.getUTCDate() + step);
  return out;
}

export function diffBusinessDays(
  from: Date,
  to: Date,
  cfg: CalendarConfig = defaultUaeCalendar(),
): number {
  if (from.getTime() === to.getTime()) return 0;
  const step = from < to ? 1 : -1;
  let count = 0;
  const cursor = new Date(from.getTime());
  while (cursor.getTime() !== to.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + step);
    if (isBusinessDay(cursor, cfg)) count += step;
    // Safety break if dates drift past each other due to daylight oddities.
    if (Math.abs(count) > 365 * 10) break;
  }
  return count;
}
