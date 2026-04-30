// Hawkeye Sterling — PDPL guard (audit follow-up #40).
//
// UAE Personal Data Protection Law (Federal Decree-Law 45/2021) Article
// 13 mandates data minimisation: PII fields outside the lawful basis +
// retention window must NOT leak into outbound logs, exports, or
// analytics. This module redacts PDPL-protected fields from any string
// or structured object before it crosses an audit boundary.
//
// Detected categories (per PDPL Art.7 sensitive data + practical AML
// PII set):
//   · Emirates ID                — 15-digit format, 784-YYYY-NNNNNNN-N
//   · UAE / international passport — A-Z + 6-9 digits
//   · UAE phone                  — +971 prefix, mobile / landline
//   · International phone        — E.164 format
//   · Email
//   · Date of birth              — ISO 8601 / DD-MM-YYYY etc.
//   · Address line               — heuristic, near "address" / "addr" tokens
//   · IBAN                       — country code + 2 check digits + 16-32 alphanumeric
//   · Wallet address             — bc1 / 0x / cosmos1 etc. (NOT redacted by default —
//                                   AML requires it; flagged but kept)
//
// Usage:
//   import { redactPdpl, scanPdpl } from './pdpl-guard.js';
//   const safe = redactPdpl(rawText);
//   const flags = scanPdpl(rawText);     // for audit logging
//   const safeObj = redactPdplObject(payload);

export type PdplCategory =
  | 'emirates_id'
  | 'passport'
  | 'phone_uae'
  | 'phone_intl'
  | 'email'
  | 'date_of_birth'
  | 'address_line'
  | 'iban'
  | 'wallet_address';

export interface PdplFinding {
  category: PdplCategory;
  match: string;
  index: number;
  severity: 'high' | 'medium' | 'low';
}

interface Detector {
  category: PdplCategory;
  rx: RegExp;
  redact: boolean;          // true = mask in redactPdpl(); false = leave as-is, flag only.
  severity: PdplFinding['severity'];
  // How many trailing chars to preserve when redacting (for traceability).
  preserveTail?: number;
}

const DETECTORS: Detector[] = [
  // Emirates ID — 784-YYYY-NNNNNNN-N
  { category: 'emirates_id', rx: /\b784-\d{4}-\d{7}-\d\b/g, redact: true, severity: 'high', preserveTail: 4 },
  // Passport — letter prefix + 6-9 digits (international + UAE M/N/P prefixes)
  { category: 'passport', rx: /\b[A-Z]{1,2}\d{6,9}\b/g, redact: true, severity: 'high', preserveTail: 3 },
  // UAE phone — +971 followed by 8-9 digits (with optional spaces/hyphens)
  { category: 'phone_uae', rx: /\+971[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}/g, redact: true, severity: 'medium' },
  // International phone — generic E.164 — be conservative, only +cc + 6-14 digits
  { category: 'phone_intl', rx: /\+(?!971)\d{1,3}[\s-]?\d{4,12}/g, redact: true, severity: 'medium' },
  // Email
  { category: 'email', rx: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, redact: true, severity: 'medium' },
  // Date of birth — ISO + dd-mm-yyyy + dd/mm/yyyy + dd Mon yyyy (NB: also catches non-DoB dates;
  // redact when adjacent to dob/birth tokens? — kept simple for now, redact aggressively).
  { category: 'date_of_birth', rx: /\b(?:19|20)\d{2}-\d{2}-\d{2}\b|\b\d{2}[\/-]\d{2}[\/-](?:19|20)\d{2}\b/g, redact: true, severity: 'medium' },
  // IBAN — 2-letter country code + 2 check digits + 16-32 alphanumerics
  { category: 'iban', rx: /\b[A-Z]{2}\d{2}[A-Z0-9]{16,32}\b/g, redact: true, severity: 'high', preserveTail: 4 },
  // Wallet address — flag-only, do NOT redact (AML investigations need them)
  { category: 'wallet_address', rx: /\b(?:0x[a-fA-F0-9]{40}|bc1[a-z0-9]{38,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g, redact: false, severity: 'low' },
];

const ADDRESS_TOKEN_PROXIMITY = /(?:address|addr|residence|domicile)\s*[:=]?\s*([^\n]{6,160})/gi;

/** Scan text for PDPL-relevant fields. Read-only. */
export function scanPdpl(text: string): PdplFinding[] {
  if (!text || typeof text !== 'string') return [];
  const findings: PdplFinding[] = [];
  for (const d of DETECTORS) {
    let m: RegExpExecArray | null;
    d.rx.lastIndex = 0;
    while ((m = d.rx.exec(text)) !== null) {
      findings.push({
        category: d.category,
        match: m[0],
        index: m.index,
        severity: d.severity,
      });
      if (m.index === d.rx.lastIndex) d.rx.lastIndex++;
    }
  }
  // Address-line heuristic — only fires when an "address:" or "addr:" token precedes the line.
  let am: RegExpExecArray | null;
  ADDRESS_TOKEN_PROXIMITY.lastIndex = 0;
  while ((am = ADDRESS_TOKEN_PROXIMITY.exec(text)) !== null) {
    const tail = am[1] ?? '';
    findings.push({
      category: 'address_line',
      match: tail.trim(),
      index: am.index + (am[0].length - tail.length),
      severity: 'medium',
    });
    if (am.index === ADDRESS_TOKEN_PROXIMITY.lastIndex) ADDRESS_TOKEN_PROXIMITY.lastIndex++;
  }
  return findings.sort((a, b) => a.index - b.index);
}

function maskMatch(match: string, preserveTail = 0): string {
  if (match.length <= preserveTail + 2) return '***';
  const tail = preserveTail > 0 ? match.slice(-preserveTail) : '';
  return `[REDACTED:${match.length}]${tail ? `…${tail}` : ''}`;
}

/** Redact PDPL-relevant fields from a string. Returns the safe string +
 *  the findings array describing what was redacted (for audit logs). */
export function redactPdpl(text: string): { safe: string; findings: PdplFinding[] } {
  if (!text || typeof text !== 'string') return { safe: text, findings: [] };
  const findings: PdplFinding[] = [];
  let safe = text;

  for (const d of DETECTORS) {
    if (!d.redact) continue;
    safe = safe.replace(d.rx, (m, ..._args: unknown[]) => {
      findings.push({ category: d.category, match: m, index: -1, severity: d.severity });
      return maskMatch(m, d.preserveTail ?? 0);
    });
  }

  // Address proximity — replace just the captured group, not the whole match.
  safe = safe.replace(ADDRESS_TOKEN_PROXIMITY, (whole: string, tail: string) => {
    findings.push({
      category: 'address_line',
      match: tail.trim(),
      index: -1,
      severity: 'medium',
    });
    return whole.replace(tail, ` [REDACTED:${tail.trim().length} chars]`);
  });

  // Flag-only categories (e.g. wallet_address) — surface findings but don't mutate.
  for (const d of DETECTORS) {
    if (d.redact) continue;
    let m: RegExpExecArray | null;
    d.rx.lastIndex = 0;
    while ((m = d.rx.exec(text)) !== null) {
      findings.push({ category: d.category, match: m[0], index: m.index, severity: d.severity });
      if (m.index === d.rx.lastIndex) d.rx.lastIndex++;
    }
  }

  return { safe, findings };
}

/** Recursively redact PDPL fields in any JSON-shaped object. Useful for
 *  outbound log payloads / webhook bodies / audit exports. */
export function redactPdplObject<T>(input: T): { safe: T; findings: PdplFinding[] } {
  const findings: PdplFinding[] = [];
  function walk(v: unknown): unknown {
    if (typeof v === 'string') {
      const r = redactPdpl(v);
      findings.push(...r.findings);
      return r.safe;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  }
  return { safe: walk(input) as T, findings };
}

/** Quick boolean: does this string contain ANY PDPL-flagged field? */
export function containsPdpl(text: string): boolean {
  return scanPdpl(text).length > 0;
}
