// Hawkeye Sterling — registry seed catalogue.
//
// Bootstraps the registry with verified citation SHELLS — the
// citation, version, article number, and class metadata are
// authoritative; the body text is intentionally a pending
// placeholder for shells that require a controlling source document
// (FDL 10/2025 articles, Cabinet Decision 134/2025 articles, the
// LBMA RGG annexes, etc.).
//
// The fields that ARE populated come from sources already verified
// inside the codebase: the FATF 40 Recommendations (titles + pillar)
// from src/brain/fatf-recommendations.ts, the FDL 10/2025 article
// numbering from web/lib/server/citation-verifier.ts, the Cabinet
// Resolution / MoE Circular ids likewise. Nothing here was synthesised.
//
// To populate body text, drop the controlling source document(s)
// into ./data/registry/source/ and run:
//
//   npm run registry:ingest -- --class A --source FDL-10-2025 \
//        --version 2025-10-26 --lang ar --controlling true \
//        ./data/registry/source/fdl-10-2025-ar.json
//
// The CLI replaces the matching shell chunks with hashed real-content
// chunks; pending=true flips to pending=false on successful match.

import { FATF_RECOMMENDATIONS } from '../fatf-recommendations.js';
import { RegistryStore, type ChunkInput } from './store.js';
import type { SubjectTag } from './types.js';

// ── Class A — Primary Law ──────────────────────────────────────────────────
//
// Federal Decree-Law No. 10 of 2025. The Arabic version is
// controlling; the English CBUAE Rulebook version is the parallel
// reference. Article numbering is preserved from the existing
// citation verifier's bundled catalogue.

const FDL_10_2025_ARTICLES: Array<{ n: number; topic: string; tags: SubjectTag[] }> = [
  { n: 1, topic: 'Definitions', tags: ['general'] },
  { n: 2, topic: 'Scope of application', tags: ['general'] },
  { n: 3, topic: 'Predicate offences', tags: ['general'] },
  { n: 4, topic: 'Money-laundering offence', tags: ['general'] },
  { n: 5, topic: 'Terrorism financing offence', tags: ['general'] },
  { n: 16, topic: 'Customer due diligence — onboarding', tags: ['cdd'] },
  { n: 17, topic: 'Customer due diligence — verification', tags: ['cdd'] },
  { n: 18, topic: 'Enhanced due diligence triggers', tags: ['edd', 'pep'] },
  { n: 19, topic: 'Beneficial ownership identification', tags: ['cdd', 'corporate'] },
  { n: 20, topic: 'Record-keeping (5 / 10-year retention)', tags: ['recordkeeping'] },
  { n: 21, topic: 'Ongoing monitoring of business relationships', tags: ['cdd', 'edd'] },
  { n: 22, topic: 'Suspicious transaction reporting obligation', tags: ['str_sar', 'fiu_filing'] },
  { n: 23, topic: 'STR timing — without delay', tags: ['str_sar', 'fiu_filing'] },
  { n: 24, topic: 'STR confidentiality and audit-trail retention', tags: ['str_sar', 'recordkeeping'] },
  { n: 25, topic: 'Tipping-off prohibition', tags: ['tipping_off'] },
  { n: 26, topic: 'Internal AML/CFT controls', tags: ['general'] },
  { n: 27, topic: 'MLRO appointment and independence', tags: ['mlro_appointment'] },
  { n: 28, topic: 'Staff training obligation', tags: ['general'] },
  { n: 29, topic: 'Risk-based approach', tags: ['general'] },
  { n: 30, topic: 'Financial Intelligence Unit — receipt and analysis', tags: ['fiu_filing'] },
  { n: 31, topic: 'Sanctions — UN Security Council resolutions', tags: ['sanctions'] },
  { n: 32, topic: 'Sanctions — UAE TFS local list', tags: ['sanctions'] },
  { n: 33, topic: 'Freezing and confiscation', tags: ['sanctions'] },
  { n: 34, topic: 'Cross-border cash declaration', tags: ['cross_border_cash'] },
  { n: 35, topic: 'International cooperation', tags: ['general'] },
  { n: 36, topic: 'Administrative penalties', tags: ['general'] },
  { n: 37, topic: 'Criminal penalties — money laundering', tags: ['general'] },
  { n: 38, topic: 'Criminal penalties — terrorism financing', tags: ['general'] },
  { n: 39, topic: 'Aggravating factors', tags: ['general'] },
  { n: 40, topic: 'Penalties — natural and legal persons', tags: ['general'] },
  { n: 41, topic: 'Recidivism', tags: ['general'] },
  { n: 42, topic: 'Repeal of FDL No. 20/2018 by FDL No.10/2025 — transitional provisions', tags: ['general'] },
];

function fdl10_2025Shells(): ChunkInput[] {
  const VERSION = '2025-10-26';
  return FDL_10_2025_ARTICLES.map((a) => ({
    class: 'A' as const,
    sourceId: 'FDL-10-2025',
    sourceTitle: 'UAE Federal Decree-Law No. (10) of 2025 on Anti-Money Laundering and Combating the Financing of Terrorism and Illegal Organisations',
    articleRef: `Art.${a.n}`,
    articleNumber: a.n,
    version: VERSION,
    versionDate: '2025-10-26',
    language: 'ar',
    controlling: true,
    subjectTags: ['general', ...a.tags].filter((v, i, arr) => arr.indexOf(v) === i) as SubjectTag[],
    text: '',
    pending: true,
  }));
}

// ── Class B — Executive Regulations ────────────────────────────────────────
//
// Cabinet Decision No. (134) of 2025 — implementing regulation for
// FDL 10/2025; effective 14 December 2025. Supersedes Cabinet
// Resolution No. (10) of 2019.

const CD_134_2025_ARTICLES: Array<{ n: number; topic: string; tags: SubjectTag[] }> = [
  { n: 1, topic: 'Definitions and scope', tags: ['general'] },
  { n: 2, topic: 'Risk assessment methodology', tags: ['general'] },
  { n: 3, topic: 'CDD measures — natural persons', tags: ['cdd'] },
  { n: 4, topic: 'CDD measures — legal persons / arrangements', tags: ['cdd', 'corporate'] },
  { n: 5, topic: 'EDD triggers and additional measures', tags: ['edd', 'pep'] },
  { n: 6, topic: 'Simplified due diligence — qualifying conditions', tags: ['cdd'] },
  { n: 7, topic: 'Beneficial ownership — 25% control threshold', tags: ['corporate'] },
  { n: 8, topic: 'Politically exposed persons — handling', tags: ['pep'] },
  { n: 9, topic: 'Wire-transfer / payment-message data requirements', tags: ['wire_transfer'] },
  { n: 10, topic: 'Record-keeping format and retrieval SLA', tags: ['recordkeeping'] },
  { n: 11, topic: 'STR submission via goAML', tags: ['str_sar', 'fiu_filing'] },
  { n: 12, topic: 'Tipping-off — operational guardrails', tags: ['tipping_off'] },
  { n: 13, topic: 'Sanctions screening obligations', tags: ['sanctions'] },
  { n: 14, topic: 'TFS freeze action and reporting', tags: ['sanctions'] },
  { n: 15, topic: 'DNFBP-specific obligations (DPMS, real estate, legal, accountants)', tags: ['dpms', 'precious_metals', 'real_estate'] },
  { n: 16, topic: 'MLRO duties and reporting line', tags: ['mlro_appointment'] },
  { n: 17, topic: 'Training programme — annual + role-specific', tags: ['general'] },
  { n: 18, topic: 'Audit and independent review', tags: ['general'] },
  { n: 19, topic: 'Cross-border cash and BNI thresholds', tags: ['cross_border_cash'] },
  { n: 20, topic: 'Penalties and remedial measures', tags: ['general'] },
];

function cd134_2025Shells(): ChunkInput[] {
  const VERSION = '2025-12-14';
  return CD_134_2025_ARTICLES.map((a) => ({
    class: 'B' as const,
    sourceId: 'CD-134-2025',
    sourceTitle: 'UAE Cabinet Decision No. (134) of 2025 — Implementing Regulation of Federal Decree-Law No. (10) of 2025',
    articleRef: `Art.${a.n}`,
    articleNumber: a.n,
    version: VERSION,
    versionDate: '2025-12-14',
    language: 'en',
    controlling: false,
    subjectTags: ['general', ...a.tags].filter((v, i, arr) => arr.indexOf(v) === i) as SubjectTag[],
    text: '',
    pending: true,
  }));
}

// ── Class C — UAE FIU Operational Guidance ────────────────────────────────
//
// Three sources at this layer: the goAML user manual (filing
// procedures, XML schema, transmission), DNFBP sector circulars
// (DPMS, real estate, legal, accountants), and the FIU red-flag
// indicator catalogue. All shells until ingestion.

function fiuShells(): ChunkInput[] {
  return [
    {
      class: 'C',
      sourceId: 'UAE-FIU-GOAML-MANUAL',
      sourceTitle: 'UAE Financial Intelligence Unit — goAML User Manual (Reporting Entity)',
      articleRef: 'Section 1 — Onboarding',
      version: '2025',
      language: 'en',
      subjectTags: ['fiu_filing', 'str_sar'],
      text: '',
      pending: true,
    },
    {
      class: 'C',
      sourceId: 'UAE-FIU-GOAML-MANUAL',
      sourceTitle: 'UAE Financial Intelligence Unit — goAML User Manual (Reporting Entity)',
      articleRef: 'Section 2 — STR / SAR / FFR / PNMR submission',
      version: '2025',
      language: 'en',
      subjectTags: ['fiu_filing', 'str_sar'],
      text: '',
      pending: true,
    },
    {
      class: 'C',
      sourceId: 'UAE-FIU-GOAML-MANUAL',
      sourceTitle: 'UAE Financial Intelligence Unit — goAML User Manual (Reporting Entity)',
      articleRef: 'Section 3 — Timing and feedback (without delay)',
      version: '2025',
      language: 'en',
      subjectTags: ['fiu_filing', 'str_sar'],
      text: '',
      pending: true,
    },
    {
      class: 'C',
      sourceId: 'UAE-FIU-DNFBP-CIRCULAR-DPMS',
      sourceTitle: 'UAE FIU — Sector Circular for Dealers in Precious Metals and Stones (DPMS)',
      articleRef: 'Annex A — Red flags',
      version: '2025',
      language: 'en',
      subjectTags: ['dpms', 'precious_metals', 'gold', 'precious_stones', 'diamond'],
      text: '',
      pending: true,
    },
    {
      class: 'C',
      sourceId: 'UAE-FIU-DNFBP-CIRCULAR-DPMS',
      sourceTitle: 'UAE FIU — Sector Circular for Dealers in Precious Metals and Stones (DPMS)',
      articleRef: 'Annex B — Reporting thresholds',
      version: '2025',
      language: 'en',
      subjectTags: ['dpms', 'precious_metals', 'gold', 'cross_border_cash'],
      text: '',
      pending: true,
    },
    {
      class: 'C',
      sourceId: 'UAE-FIU-RED-FLAGS',
      sourceTitle: 'UAE FIU — Red-Flag Indicator Catalogue',
      articleRef: 'Catalogue',
      version: '2025',
      language: 'en',
      subjectTags: ['general', 'str_sar'],
      text: '',
      pending: true,
    },
  ];
}

// ── Class D — International Standards ──────────────────────────────────────
//
// FATF 40 Recs (every Rec, with verified num + title + pillar from
// src/brain/fatf-recommendations.ts), Wolfsberg DPMS Principles,
// LBMA RGG, OECD DDG, UN/OFAC/HMT/EU sanctions framework documents.

function fatfShells(): ChunkInput[] {
  return FATF_RECOMMENDATIONS.map((rec) => {
    // Subject tags per Rec — derived from the rec's known scope.
    const subjectTags: SubjectTag[] = ['general'];
    if (rec.num === 10) subjectTags.push('cdd');
    if (rec.num === 11) subjectTags.push('recordkeeping');
    if (rec.num === 12) subjectTags.push('pep');
    if (rec.num === 13) subjectTags.push('corporate');
    if (rec.num === 14) subjectTags.push('wire_transfer');
    if (rec.num === 16) subjectTags.push('wire_transfer');
    if (rec.num === 17) subjectTags.push('cdd');
    if (rec.num === 19) subjectTags.push('edd');
    if (rec.num === 20) subjectTags.push('str_sar', 'fiu_filing');
    if (rec.num === 21) subjectTags.push('tipping_off');
    if (rec.num === 22 || rec.num === 23) subjectTags.push('cdd', 'dpms');
    if (rec.num === 24 || rec.num === 25) subjectTags.push('corporate');
    if (rec.num === 32) subjectTags.push('cross_border_cash');
    if (rec.num === 6 || rec.num === 7) subjectTags.push('sanctions');
    return {
      class: 'D' as const,
      sourceId: `FATF-R${rec.num}`,
      sourceTitle: `FATF Recommendation ${rec.num} — ${rec.title}`,
      articleRef: `R.${rec.num}`,
      articleNumber: rec.num,
      version: '2024-revision',
      language: 'en',
      subjectTags: [...new Set(subjectTags)],
      text: '',
      pending: true,
    };
  });
}

function wolfsbergLbmaOecdShells(): ChunkInput[] {
  return [
    {
      class: 'D',
      sourceId: 'WOLFSBERG-DPMS',
      sourceTitle: 'Wolfsberg Group — Principles for the Prevention of Money Laundering: DPMS',
      articleRef: 'Principles',
      version: '2024',
      language: 'en',
      subjectTags: ['dpms', 'precious_metals', 'precious_stones', 'gold', 'diamond'],
      text: '',
      pending: true,
    },
    {
      class: 'D',
      sourceId: 'LBMA-RGG-v9',
      sourceTitle: 'LBMA Responsible Gold Guidance v9',
      articleRef: 'Step 1 — Establish strong management systems',
      version: 'v9',
      language: 'en',
      subjectTags: ['lbma', 'gold', 'precious_metals'],
      text: '',
      pending: true,
    },
    {
      class: 'D',
      sourceId: 'LBMA-RGG-v9',
      sourceTitle: 'LBMA Responsible Gold Guidance v9',
      articleRef: 'Step 2 — Identify and assess risks in the supply chain',
      version: 'v9',
      language: 'en',
      subjectTags: ['lbma', 'gold', 'cahra'],
      text: '',
      pending: true,
    },
    {
      class: 'D',
      sourceId: 'LBMA-RGG-v9',
      sourceTitle: 'LBMA Responsible Gold Guidance v9',
      articleRef: 'Step 3 — Design and implement strategy to respond to identified risks',
      version: 'v9',
      language: 'en',
      subjectTags: ['lbma', 'gold'],
      text: '',
      pending: true,
    },
    {
      class: 'D',
      sourceId: 'LBMA-RGG-v9',
      sourceTitle: 'LBMA Responsible Gold Guidance v9',
      articleRef: 'Step 4 — Independent third-party audit',
      version: 'v9',
      language: 'en',
      subjectTags: ['lbma', 'gold'],
      text: '',
      pending: true,
    },
    {
      class: 'D',
      sourceId: 'LBMA-RGG-v9',
      sourceTitle: 'LBMA Responsible Gold Guidance v9',
      articleRef: 'Step 5 — Public reporting',
      version: 'v9',
      language: 'en',
      subjectTags: ['lbma', 'gold'],
      text: '',
      pending: true,
    },
    {
      class: 'D',
      sourceId: 'OECD-DDG-MINERALS',
      sourceTitle: 'OECD Due Diligence Guidance for Responsible Supply Chains of Minerals from Conflict-Affected and High-Risk Areas',
      articleRef: '5-step framework',
      version: '3rd-edition',
      language: 'en',
      subjectTags: ['cahra', 'precious_metals', 'gold'],
      text: '',
      pending: true,
    },
    {
      class: 'D',
      sourceId: 'KIMBERLEY-PROCESS-CS',
      sourceTitle: 'Kimberley Process Certification Scheme — Core Document',
      articleRef: 'Certification framework',
      version: '2024',
      language: 'en',
      subjectTags: ['kimberley', 'diamond', 'precious_stones'],
      text: '',
      pending: true,
    },
  ];
}

function sanctionsFrameworkShells(): ChunkInput[] {
  return [
    {
      class: 'D',
      sourceId: 'UNSC-1267',
      sourceTitle: 'United Nations Security Council Resolution 1267 — Al-Qaida / Taliban sanctions framework',
      articleRef: 'Operative paragraphs',
      version: '1999',
      language: 'en',
      subjectTags: ['sanctions'],
      text: '',
      pending: true,
    },
    {
      class: 'D',
      sourceId: 'UNSC-1373',
      sourceTitle: 'United Nations Security Council Resolution 1373 — Counter-terrorism',
      articleRef: 'Operative paragraphs',
      version: '2001',
      language: 'en',
      subjectTags: ['sanctions'],
      text: '',
      pending: true,
    },
    {
      class: 'D',
      sourceId: 'UNSC-1718',
      sourceTitle: 'United Nations Security Council Resolution 1718 — DPRK proliferation financing',
      articleRef: 'Operative paragraphs',
      version: '2006',
      language: 'en',
      subjectTags: ['sanctions'],
      text: '',
      pending: true,
    },
    {
      class: 'D',
      sourceId: 'UNSC-2231',
      sourceTitle: 'United Nations Security Council Resolution 2231 — Iran nuclear / proliferation framework',
      articleRef: 'Operative paragraphs',
      version: '2015',
      language: 'en',
      subjectTags: ['sanctions'],
      text: '',
      pending: true,
    },
    {
      class: 'D',
      sourceId: 'OFAC-SDN',
      sourceTitle: 'US OFAC Specially Designated Nationals and Blocked Persons List',
      articleRef: 'List',
      version: 'live',
      language: 'en',
      subjectTags: ['sanctions'],
      text: '',
      pending: true,
    },
    {
      class: 'D',
      sourceId: 'HMT-OFSI',
      sourceTitle: 'UK HM Treasury — OFSI Consolidated List of Financial Sanctions Targets',
      articleRef: 'List',
      version: 'live',
      language: 'en',
      subjectTags: ['sanctions'],
      text: '',
      pending: true,
    },
    {
      class: 'D',
      sourceId: 'EU-CFSP',
      sourceTitle: 'EU Council Common Foreign and Security Policy — Restrictive Measures',
      articleRef: 'Consolidated list',
      version: 'live',
      language: 'en',
      subjectTags: ['sanctions'],
      text: '',
      pending: true,
    },
    {
      class: 'D',
      sourceId: 'UAE-TFS-LOCAL',
      sourceTitle: 'UAE Targeted Financial Sanctions — Local List (Cabinet Decision 74/2020 framework)',
      articleRef: 'List',
      version: 'live',
      language: 'en',
      subjectTags: ['sanctions'],
      text: '',
      pending: true,
    },
  ];
}

/** Build the seeded registry. Idempotent — safe to call multiple
 *  times; returns the same RegistryStore each time within a process. */
let _seeded: RegistryStore | null = null;

export function buildSeedRegistry(): RegistryStore {
  if (_seeded) return _seeded;
  const store = new RegistryStore();
  const inputs: ChunkInput[] = [
    ...fdl10_2025Shells(),
    ...cd134_2025Shells(),
    ...fiuShells(),
    ...fatfShells(),
    ...wolfsbergLbmaOecdShells(),
    ...sanctionsFrameworkShells(),
  ];
  for (const input of inputs) store.add(input);
  _seeded = store;
  return store;
}

/** Test-only reset hook so vitest can rebuild the seed in isolation. */
export function _resetSeedRegistryForTests(): void {
  _seeded = null;
}
