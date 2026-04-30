// Shared date formatting helpers — every user-facing date in the tool
// must render as dd/mm/yyyy (UAE / FATF / EU convention). The browser's
// `toLocaleDateString()` defaults to mm/dd/yyyy on US-locale machines
// and produces inconsistent output across operators, so we never call
// the locale APIs for user-facing dates — these helpers do the
// formatting deterministically.
//
// Native `<input type="date">` is locale-driven and we cannot change
// its mask cross-browser; setting `<html lang="en-GB">` in the root
// layout makes Chrome/Edge render the picker as dd/mm/yyyy. Firefox
// and Safari ignore the attribute. Operator-typed dates should go
// through `parseDMY` so they round-trip cleanly regardless of picker.

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** ISO-8601 string (or anything `new Date()` can parse) → "dd/mm/yyyy".
 *  Returns "" if the input is falsy or unparseable. */
export function formatDMY(input: string | number | Date | null | undefined): string {
  if (input === null || input === undefined || input === "") return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** ISO-8601 string (or Date) → "dd/mm/yyyy hh:mm" in 24-hour time.
 *  Returns "" if the input is falsy or unparseable. */
export function formatDMYTime(input: string | number | Date | null | undefined): string {
  if (input === null || input === undefined || input === "") return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** ISO-8601 string (or Date) → "dd/mm/yyyy hh:mm:ss" in 24-hour time.
 *  Used by audit-trail / forensic surfaces where second-precision matters
 *  for ordering and deduplication. */
export function formatDMYTimeSec(input: string | number | Date | null | undefined): string {
  if (input === null || input === undefined || input === "") return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** "dd/mm/yyyy" or "dd/mm/yyyy hh:mm" → Date. Returns null on parse
 *  failure. Tolerates 1-or-2-digit day/month and accepts the dot
 *  separator ("dd.mm.yyyy") that some EU forms use. */
export function parseDMY(input: string): Date | null {
  if (!input) return null;
  const m = input.trim().match(
    /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/,
  );
  if (!m) return null;
  const day = parseInt(m[1]!, 10);
  const month = parseInt(m[2]!, 10);
  const year = parseInt(m[3]!, 10);
  const hours = m[4] ? parseInt(m[4], 10) : 0;
  const minutes = m[5] ? parseInt(m[5], 10) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, hours, minutes);
  // Reject roll-over (e.g. 31/02/2026 → 03/03/2026): the constructor
  // silently normalises invalid dates, so we round-trip and check.
  if (d.getDate() !== day || d.getMonth() !== month - 1 || d.getFullYear() !== year) {
    return null;
  }
  return d;
}

/** "dd/mm/yyyy" → ISO-8601 date string ("yyyy-mm-dd"), suitable for
 *  passing to `<input type="date">` `value`. Returns "" if unparseable. */
export function dmyToIso(input: string): string {
  const d = parseDMY(input);
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
