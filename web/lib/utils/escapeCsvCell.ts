// Hawkeye Sterling — CSV cell escaper.
// Guards against CSV/formula injection (OWASP A03, CWE-1236): a cell whose
// value begins with =, +, -, @, tab, or CR is evaluated as a formula by
// Excel/LibreOffice when the export is opened, enabling data exfiltration
// (HYPERLINK/WEBSERVICE) or command execution (DDE) on the analyst's
// workstation. Screening tables render attacker-influenced strings (subject
// names, adverse-media headlines, registry officer names), so every CSV
// export path must use this escaper. Covered by
// web/lib/__tests__/export-safety.test.ts.

export function escapeCsvCell(v: unknown): string {
  const raw = String(v ?? "").replace(/\x00/g, "").replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, " ");
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
