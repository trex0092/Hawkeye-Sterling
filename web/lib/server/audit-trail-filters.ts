// J-08 — date-based + subject + event-type filters for /api/audit-trail.
//
// The audit chain is the authoritative regulator record. Reconstructing
// "what was screened for customer X on date Y" or "what was added to the
// OFAC SDN list between dates" requires querying the chain along those
// axes — not just paginating from newest backwards. This module is the
// pure filter layer; the route layer plumbs query params → filter call
// → paginate.
//
// Filter parameters (all optional):
//   fromDate     — ISO-8601 string. Entries with at >= fromDate match.
//   toDate       — ISO-8601 string. Entries with at <= toDate match.
//                  Bad dates yield no-filter (defensive — never panic on
//                  malformed regulator-supplied input).
//   subjectId    — exact match on payload.subjectId.
//   subjectName  — case-insensitive substring match on payload.subjectName.
//   eventType    — exact match on payload.event (e.g.,
//                  "screening.completed", "screening.false_positive").

export interface AuditTrailEntryShape {
  seq: number;
  at: string;
  payload?: unknown;
}

export interface AuditTrailFilter {
  fromDate?: string | null;
  toDate?: string | null;
  subjectId?: string | null;
  subjectName?: string | null;
  eventType?: string | null;
}

function readField(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function parseDateMs(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** Applies the filter to an entry. Returns true if the entry should be kept. */
export function matchesFilter<E extends AuditTrailEntryShape>(
  entry: E,
  filter: AuditTrailFilter,
): boolean {
  const fromMs = parseDateMs(filter.fromDate);
  const toMs = parseDateMs(filter.toDate);
  if (fromMs !== null || toMs !== null) {
    const entryMs = parseDateMs(entry.at);
    if (entryMs === null) return false; // entry has malformed timestamp — exclude
    if (fromMs !== null && entryMs < fromMs) return false;
    if (toMs !== null && entryMs > toMs) return false;
  }

  if (filter.subjectId) {
    if (readField(entry.payload, "subjectId") !== filter.subjectId) return false;
  }

  if (filter.subjectName) {
    const name = readField(entry.payload, "subjectName");
    if (!name) return false;
    if (!name.toLowerCase().includes(filter.subjectName.toLowerCase())) return false;
  }

  if (filter.eventType) {
    if (readField(entry.payload, "event") !== filter.eventType) return false;
  }

  return true;
}

/** Apply the filter to an entire chain. Convenience wrapper. */
export function filterAuditEntries<E extends AuditTrailEntryShape>(
  entries: readonly E[],
  filter: AuditTrailFilter,
): E[] {
  if (
    !filter.fromDate &&
    !filter.toDate &&
    !filter.subjectId &&
    !filter.subjectName &&
    !filter.eventType
  ) {
    return entries.slice();
  }
  return entries.filter((e) => matchesFilter(e, filter));
}
