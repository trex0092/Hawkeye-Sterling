// Hawkeye Sterling — deterministic scope hasher.
// Every screening output must carry a scopeHash that covers (a) lists checked,
// (b) list version dates, (c) jurisdictions, (d) matching methods, (e) the
// brain version, and (f) the compliance-charter hash. Two screenings with the
// same scope hash are guaranteed to have used identical rails.

import { fnv1a } from './audit-chain.js';

export interface ScopeDeclaration {
  listsChecked: string[];
  listVersionDates: Record<string, string>;
  jurisdictions: string[];
  matchingMethods: string[];
  brainVersion: string;
  charterHash: string;
  adverseMediaFrom?: string;
  adverseMediaTo?: string;
}

function canonical(obj: Record<string, unknown>): string {
  // Stable stringify: keys sorted, arrays sorted, nullables normalised.
  const entries = Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
  const norm: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    if (Array.isArray(v)) norm[k] = [...v].map(String).sort();
    else if (v && typeof v === 'object') norm[k] = canonical(v as Record<string, unknown>);
    else norm[k] = v ?? null;
  }
  return JSON.stringify(norm);
}

export function scopeHash(s: ScopeDeclaration): string {
  return fnv1a(canonical(s as unknown as Record<string, unknown>));
}

export function scopeCoverageReport(s: ScopeDeclaration): {
  listsDeclared: number;
  listsWithVersionDate: number;
  missingVersionDates: string[];
  charterBound: boolean;
} {
  const missing = s.listsChecked.filter((l) => !s.listVersionDates[l]);
  return {
    listsDeclared: s.listsChecked.length,
    listsWithVersionDate: s.listsChecked.length - missing.length,
    missingVersionDates: missing,
    charterBound: !!s.charterHash,
  };
}
