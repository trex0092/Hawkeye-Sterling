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
  { iso2: 'LY', name: 'Libya', status: 'active_cahra', drivers: ['armed conflict', 'fragmented governance', 'illicit gold and oil flows'], observedAt: '2025-01-01T00:00:00Z', sources: ['UN Panel of Experts Libya', 'OECD DDG reference'] },
  { iso2: 'ET', name: 'Ethiopia (Tigray region)', status: 'active_cahra', drivers: ['armed conflict', 'humanitarian crisis', 'ASGM in conflict zone'], observedAt: '2025-01-01T00:00:00Z', sources: ['UN OCHA Ethiopia', 'OECD DDG reference'] },
  { iso2: 'TD', name: 'Chad', status: 'watch_list', drivers: ['political instability', 'cross-border armed conflict', 'ASGM activity'], observedAt: '2025-01-01T00:00:00Z', sources: ['OECD DDG reference'] },
  { iso2: 'MZ', name: 'Mozambique (Cabo Delgado)', status: 'active_cahra', drivers: ['armed insurgency', 'ASGM in conflict zone', 'natural resource exploitation'], observedAt: '2025-01-01T00:00:00Z', sources: ['UN OCHA Mozambique', 'OECD DDG reference'] },
  { iso2: 'CM', name: 'Cameroon (North-West / South-West)', status: 'watch_list', drivers: ['armed conflict', 'Anglophone crisis', 'governance gaps'], observedAt: '2025-01-01T00:00:00Z', sources: ['UN OCHA Cameroon', 'OECD DDG reference'] },
  { iso2: 'HT', name: 'Haiti', status: 'active_cahra', drivers: ['gang-controlled territory', 'state collapse', 'systemic corruption'], observedAt: '2025-01-01T00:00:00Z', sources: ['UN SC Haiti', 'FATF grey-list status 2023'] },
  { iso2: 'IQ', name: 'Iraq (north and border regions)', status: 'watch_list', drivers: ['residual armed conflict', 'militia control', 'corruption'], observedAt: '2025-01-01T00:00:00Z', sources: ['UN Assistance Mission Iraq', 'OECD DDG reference'] },
  { iso2: 'SY', name: 'Syria', status: 'active_cahra', drivers: ['armed conflict', 'sanctions environment', 'fragmented control'], observedAt: '2025-01-01T00:00:00Z', sources: ['UN COI Syria', 'OFAC Syria sanctions'] },
  { iso2: 'NG', name: 'Nigeria (North-East and Niger Delta)', status: 'watch_list', drivers: ['Boko Haram insurgency', 'artisanal oil theft', 'illegal mineral extraction'], observedAt: '2025-01-01T00:00:00Z', sources: ['OECD DDG reference', 'UN OCHA Nigeria'] },
];

export const CAHRA_BY_ISO: Map<string, CahraEntry> = new Map(
  CAHRA_SEED.map((c) => [c.iso2, c]),
);

export function isCahra(iso2: string): boolean {
  const c = CAHRA_BY_ISO.get(iso2.toUpperCase());
  return c?.status === 'active_cahra';
}
