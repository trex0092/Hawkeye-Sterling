// Hawkeye Sterling — Conflict-Affected and High-Risk Areas (CAHRA).
// CAHRA identification is mandatory under OECD Due Diligence Guidance (Annex II)
// for responsible mineral supply chains. The brain treats CAHRA classification
// as a hard gate on DPMS refinery / bullion flows.
//
// VERSIONED: CAHRA status is contested and moves with conflict dynamics. Every
// row here is a SEED value; the authoritative live list is expected to come
// from periodic Phase-2 refresh. The brain cites this registry with the
// `observedAt` field so downstream can assess freshness.

export type CahraStatus = 'active_cahra' | 'watch_list' | 'not_listed';

export interface CahraEntry {
  iso2: string;
  name: string;
  status: CahraStatus;
  drivers: string[];
  observedAt: string;
  sources: string[];
}

export const CAHRA_SEED: CahraEntry[] = [
  { iso2: 'AF', name: 'Afghanistan', status: 'active_cahra', drivers: ['armed conflict', 'systemic corruption'], observedAt: '2025-01-01T00:00:00Z', sources: ['OECD DDG reference', 'UN Panel of Experts'] },
  { iso2: 'CD', name: 'Democratic Republic of the Congo (eastern provinces)', status: 'active_cahra', drivers: ['armed conflict', 'ASM in conflict zones'], observedAt: '2025-01-01T00:00:00Z', sources: ['OECD DDG Annex II', 'UN GoE DRC'] },
  { iso2: 'ML', name: 'Mali', status: 'active_cahra', drivers: ['armed conflict', 'weak state control'], observedAt: '2025-01-01T00:00:00Z', sources: ['OECD DDG reference'] },
  { iso2: 'BF', name: 'Burkina Faso', status: 'active_cahra', drivers: ['armed conflict', 'insurgency'], observedAt: '2025-01-01T00:00:00Z', sources: ['OECD DDG reference'] },
  { iso2: 'NE', name: 'Niger', status: 'watch_list', drivers: ['political instability'], observedAt: '2025-01-01T00:00:00Z', sources: ['OECD DDG reference'] },
  { iso2: 'SO', name: 'Somalia', status: 'active_cahra', drivers: ['armed conflict'], observedAt: '2025-01-01T00:00:00Z', sources: ['UN SC Somalia'] },
  { iso2: 'SD', name: 'Sudan', status: 'active_cahra', drivers: ['armed conflict'], observedAt: '2025-01-01T00:00:00Z', sources: ['OECD DDG reference'] },
  { iso2: 'SS', name: 'South Sudan', status: 'active_cahra', drivers: ['armed conflict'], observedAt: '2025-01-01T00:00:00Z', sources: ['UN SC South Sudan'] },
  { iso2: 'CF', name: 'Central African Republic', status: 'active_cahra', drivers: ['armed conflict'], observedAt: '2025-01-01T00:00:00Z', sources: ['UN Panel of Experts CAR'] },
  { iso2: 'MM', name: 'Myanmar', status: 'active_cahra', drivers: ['armed conflict', 'military rule'], observedAt: '2025-01-01T00:00:00Z', sources: ['OHCHR Myanmar'] },
  { iso2: 'YE', name: 'Yemen', status: 'active_cahra', drivers: ['armed conflict'], observedAt: '2025-01-01T00:00:00Z', sources: ['UN GoE Yemen'] },
  { iso2: 'VE', name: 'Venezuela', status: 'watch_list', drivers: ['systemic corruption', 'illicit gold flows'], observedAt: '2025-01-01T00:00:00Z', sources: ['OECD DDG reference'] },
];

export const CAHRA_BY_ISO: Map<string, CahraEntry> = new Map(
  CAHRA_SEED.map((c) => [c.iso2, c]),
);

export function isCahra(iso2: string): boolean {
  const c = CAHRA_BY_ISO.get(iso2.toUpperCase());
  return c?.status === 'active_cahra';
}
