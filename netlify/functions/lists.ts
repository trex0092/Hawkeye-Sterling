// GET /api/lists — sanctions/PEP/adverse-media list freshness status.
// When Netlify Blobs has a refresh-lists report for a list we surface the
// real fetchedAt, record count, checksum, and error set. Otherwise we return
// 'planned'. List metadata always surfaces.

import type { Handler } from '@netlify/functions';
import { getBlobsStore } from '../../src/ingestion/blobs-store.js';
import type { IngestionReport } from '../../src/ingestion/types.js';

interface ListStatus {
  id: string;
  displayName: string;
  authority: string;
  coverage: string;
  phase: number;
  status: 'planned' | 'ingested' | 'stale' | 'error';
  fetchedAt?: string;
  recordCount?: number;
  checksum?: string;
  durationMs?: number;
  errors?: string[];
}

const STALE_AFTER_MS = 36 * 3600_000;  // 36 h

const LISTS: Omit<ListStatus, 'status'>[] = [
  { id: 'un_consolidated', displayName: 'UN Consolidated List',
    authority: 'United Nations Security Council',
    coverage: 'global sanctions, designated individuals & entities', phase: 2 },
  { id: 'un_1267', displayName: 'UN 1267 / ISIL / Al-Qaida',
    authority: 'UN Security Council 1267 Committee',
    coverage: "ISIL (Da'esh), Al-Qaida, associated individuals, groups, undertakings", phase: 2 },
  { id: 'ofac_sdn', displayName: 'OFAC SDN',
    authority: 'US Department of the Treasury (OFAC)',
    coverage: 'Specially Designated Nationals, blocked persons', phase: 2 },
  { id: 'ofac_cons', displayName: 'OFAC Consolidated Non-SDN',
    authority: 'US Department of the Treasury (OFAC)',
    coverage: 'FSE, SSI, 13599, NS-PLC, and related lists', phase: 2 },
  { id: 'bis_entity', displayName: 'BIS Entity List',
    authority: 'US Department of Commerce (BIS)',
    coverage: 'export-control denied parties; MEU / VEU; FDPR targets', phase: 2 },
  { id: 'eu_fsf', displayName: 'EU Financial Sanctions Files',
    authority: 'European External Action Service',
    coverage: 'EU restrictive measures, consolidated XML', phase: 2 },
  { id: 'uk_ofsi', displayName: 'UK OFSI Consolidated List',
    authority: 'HM Treasury — OFSI', coverage: 'UK sanctions regime designations', phase: 2 },
  { id: 'ch_seco', displayName: 'Swiss SECO Sanctions',
    authority: 'State Secretariat for Economic Affairs (SECO)',
    coverage: 'Swiss autonomous + UN-aligned sanctions', phase: 2 },
  { id: 'au_dfat', displayName: 'Australia DFAT Consolidated List',
    authority: 'Department of Foreign Affairs and Trade',
    coverage: 'Australian autonomous sanctions + UNSC listings', phase: 2 },
  { id: 'ca_sema', displayName: 'Canada SEMA / JVCFOA',
    authority: 'Global Affairs Canada',
    coverage: 'Special Economic Measures + Justice for Victims of Corrupt Foreign Officials', phase: 2 },
  { id: 'uae_eocn', displayName: 'UAE EOCN Sanctions List',
    authority: 'UAE Executive Office for Control & Non-Proliferation',
    coverage: 'UAE national sanctions list implementing UNSCRs and local designations', phase: 2 },
  { id: 'uae_ltl', displayName: 'UAE Local Terrorist List',
    authority: 'UAE Cabinet',
    coverage: 'UAE Cabinet-designated terrorist individuals & organisations', phase: 2 },
  { id: 'sama_ksa', displayName: 'SAMA Sanctions (Saudi Arabia)',
    authority: 'Saudi Central Bank', coverage: 'KSA financial-sector sanctions circulars', phase: 2 },
  { id: 'cbe_egy', displayName: 'CBE Sanctions (Egypt)',
    authority: 'Central Bank of Egypt', coverage: 'Egyptian banking-sector sanctions directives', phase: 2 },
  { id: 'mas_sg', displayName: 'MAS Sanctions (Singapore)',
    authority: 'Monetary Authority of Singapore', coverage: 'Singapore targeted financial-sanctions regime', phase: 2 },
  { id: 'hk_hkma', displayName: 'HKMA Sanctions (Hong Kong)',
    authority: 'Hong Kong Monetary Authority', coverage: 'Hong Kong banking-sector UNSCR implementation', phase: 2 },
  { id: 'austrac_soeil', displayName: 'AUSTRAC SOEIL / DFAT Overlay',
    authority: 'Australian Transaction Reports and Analysis Centre',
    coverage: 'State-owned enterprise + sanctions intelligence overlay', phase: 2 },
  { id: 'interpol_red', displayName: 'Interpol Red / Blue / Green Notices',
    authority: 'INTERPOL', coverage: 'Wanted / located / warned persons across 196 member countries', phase: 2 },
  { id: 'world_bank_debar', displayName: 'World Bank Debarment List',
    authority: 'World Bank Group', coverage: 'Sanctioned firms + individuals from Bank-financed projects', phase: 2 },
  { id: 'adb_debar', displayName: 'ADB Debarment List',
    authority: 'Asian Development Bank', coverage: 'ADB-sanctioned firms and individuals', phase: 2 },
  { id: 'fatf_grey_black', displayName: 'FATF Grey + Black List (jurisdictions)',
    authority: 'Financial Action Task Force',
    coverage: 'Call-for-Action + Increased-Monitoring jurisdiction lists', phase: 2 },
  { id: 'opensanctions_pep', displayName: 'OpenSanctions PEP',
    authority: 'OpenSanctions.org', coverage: 'politically-exposed persons, family & close associates', phase: 5 },
  { id: 'opensanctions_default', displayName: 'OpenSanctions Default Topics',
    authority: 'OpenSanctions.org', coverage: 'sanctions, PEPs, debarment, crime, regulatory warnings — aggregated', phase: 5 },
  { id: 'adverse_media', displayName: 'Adverse Media (news + RSS + CSE)',
    authority: 'Aggregated', coverage: 'financial crime, TF, PF, corruption, legal/regulatory — multi-language', phase: 6 },
];

export const handler: Handler = async () => {
  const store = await getBlobsStore();
  const now = Date.now();
  const out: ListStatus[] = [];
  for (const meta of LISTS) {
    const report = await store.getReport(meta.id).catch<IngestionReport | null>(() => null);
    if (!report) { out.push({ ...meta, status: 'planned' }); continue; }
    const age = now - report.fetchedAt;
    const status: ListStatus['status'] = report.errors.length > 0 ? 'error'
      : age > STALE_AFTER_MS ? 'stale' : 'ingested';
    out.push({
      ...meta, status,
      fetchedAt: new Date(report.fetchedAt).toISOString(),
      recordCount: report.recordCount,
      checksum: report.checksum.slice(0, 16),
      durationMs: report.durationMs,
      ...(report.errors.length > 0 ? { errors: report.errors } : {}),
    });
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
    body: JSON.stringify({
      lists: out,
      generatedAt: new Date().toISOString(),
      note: 'Lists with status=planned have not yet been ingested by the scheduled refresh. Status becomes ingested → stale → error based on freshness and fetch outcome.',
    }),
  };
};
