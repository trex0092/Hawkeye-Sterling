// Hawkeye Sterling — Screening Compliance Report (SCR) data model.
// Covers all 14 sections produced by the bureau for every screening run.
// Four disposition outcomes: standard_cdd · cleared · edd_continuance · prohibited.

// ── Enumerations ──────────────────────────────────────────────────────────────

export type SCRDisposition =
  | 'standard_cdd'    // negative — onboarding proceeds
  | 'cleared'         // false positive — match discounted
  | 'edd_continuance' // partial match — enhanced due-diligence pending
  | 'prohibited';     // positive match — refused at gate

export type SCRAdjudicationState =
  | 'AUTOMATED'
  | 'HUMAN REVIEW'
  | 'DECISION'
  | 'ATTESTED'
  | 'SEALED';

export type SCRMatchType =
  | 'exact'
  | 'name_dob'
  | 'name_only'
  | 'phonetic_name_only'
  | 'phonetic_name_dob'
  | 'name_nationality'
  | 'name_dob_nationality_passport';

export type SCRSectionFindingColour = 'green' | 'amber' | 'red' | 'neutral';

// ── Document control ─────────────────────────────────────────────────────────

export interface SCRDocumentControl {
  reportNo: string;          // HS-SCR-2026-04-00212
  alertRef: string;          // SCR-881412 (auto) | ALT-778201
  session: string;           // a7fb19c4
  version: string;           // 1.0 - final
  issued: string;            // 2026-04-25 · 12:31 GST
  effective: string;         // on issue
  retention: string;         // 10 yrs · WORM
  classification: string;    // Confidential — Restricted
  bureau: string;            // Hawkeye Sterling DXB
  approved: string;          // auto · QA passed | 2026-04-25 · 11:48 GST
  sla: string;               // within Cab. Res. 134/2025 Art. 17 2
}

// ── Cover-page summary ───────────────────────────────────────────────────────

export interface SCRCoverSummary {
  /** Italic sub-headline under the main title */
  subtitle: string;
  subject: string;
  subjectType: string;       // Legal entity (LLC) | Natural person
  uboOfRecord: string;       // F. Al-Mansoori · UAE | N/A – natural person
  screeningTrigger: string;  // CDD onboarding | DPMS routine (>AED 55K)
  ewraRiskTier: string;      // LOW · 03 / 25
  disposition: string;       // Standard CDD | Cleared · false positive | EDD · continuance | Prohibited · refused
}

// ── Section 01 — Executive summary ───────────────────────────────────────────

export interface SCRExecutiveSummary {
  finding: string;           // "Negative finding." | "False positive." | "Partial finding." | "Composite positive match."
  findingDetail: string;     // Full paragraph text
  actionTaken: string;       // Full paragraph text
  confidence: string;        // Full paragraph text
}

// ── Section 02 — Subject of record ───────────────────────────────────────────

export interface SCRDataCell {
  label: string;
  value: string;
  tag?: string;              // e.g. NON-CAHRA · EMBASSY VERIFY PENDING · DESIGNATED · BREACH
  tagColour?: 'orange' | 'pink' | 'green';
  evidence?: string;         // ev-81412-A1
}

export interface SCRSubjectOfRecord {
  basis: string;             // authority / basis line
  cells: SCRDataCell[];      // variable grid — up to 12 cells
}

// ── Section 03 — Screening trigger & risk basis ───────────────────────────────

export interface SCRTrigger {
  triggerEvent: string;
  ewraTier: string;
  cadence: string;
  bureauOperator: string;
  dpmsThreshold: string;
  vaTravelRule: string;
  tenYrLookback: string;     // "APPLIED" label shown when active
  tenYrLookbackApplied: boolean;
  sessionRef: string;
}

// ── Section 04 — Methodology & engine configuration ─────────────────────────

export interface SCRMethodologyRow {
  id: string;                // 4.1 ENGINE
  value: string;
  ref?: string;              // right-column reference code
}

export interface SCRMethodology {
  rows: SCRMethodologyRow[];
}

// ── Section 05 — Domain I · Targeted financial sanctions ─────────────────────

export interface SCRSanctionsRegister {
  register: string;
  version: string;
  records: number | string;
  hits: number;
  coverage: string;          // √ full | partial
  authority: string;         // [A.04]
}

export interface SCRSanctionsHit {
  source: string;
  matchType: SCRMatchType | string;
  score: string;             // "100%" | "89%" etc.
  listedEntity: string;
  discriminatorDivergence?: string;
  designated?: string;       // date or reference
}

export interface SCRDomainI {
  registers: SCRSanctionsRegister[];
  hits?: SCRSanctionsHit[];           // present only when hits > 0
  adjudicatorFinding: SCRAdjudicatorFinding;
}

// ── Section 06 — Domains II & III · PEP & adverse media ─────────────────────

export interface SCRPepRegister {
  provider: string;
  version: string;
  records: string;           // "2.4M"
  hits: number;
  coverage: string;
}

export interface SCRPepHit {
  provider: string;
  record: string;
  entered: string;
  category: string;
  tier: string;              // T1 | T2
}

export interface SCRAdverseMediaCorpus {
  corpus: string;
  scope: string;
  hits: number;
}

export interface SCRAdverseMediaHit {
  sourceTier: string;
  date: string;
  category: string;          // SANCTIONS EVASION | MONEY LAUNDERING etc.
  categoryColour?: 'red' | 'orange' | 'blue' | 'purple';
  substance: string;
  corroboration: string;
}

export interface SCRDomainIIIII {
  pepRegisters: SCRPepRegister[];
  pepHits?: SCRPepHit[];
  adverseMediaCorpora: SCRAdverseMediaCorpus[];
  adverseMediaHits?: SCRAdverseMediaHit[];
  adjudicatorFinding: SCRAdjudicatorFinding;
}

// ── Section 07 — Domain IV · Beneficial-ownership & RCA graph ────────────────

export interface SCRUBOCell {
  label: string;
  value: string;
  evidence?: string;
}

export interface SCRDomainIV {
  cells?: SCRUBOCell[];      // only for entity subjects
  adjudicatorFinding: SCRAdjudicatorFinding;
}

// ── Shared: adjudicator finding box ─────────────────────────────────────────

export interface SCRAdjudicatorFinding {
  sectionRef: string;        // "5.1" | "6.1" | "7.1"
  colour: SCRSectionFindingColour;
  text: string;              // main finding paragraph(s)
  additionalParagraphs?: string[];
  reviewer: string;
  countersign?: string;
  evidenceFile?: string;
  confidence: string;        // "1.00 · clear" | "0.99 · positive" | "0.45 · partial"
  qaSample?: string;         // "retained (5%)"
  sourceIndependence?: string;
  rescreen?: string;         // ISO date for re-screen
  sla?: string;
  pepConfidence?: string;
  amConfidence?: string;
}

// ── Section 08 — Aggregate risk & final disposition ─────────────────────────

export interface SCRAggregateRisk {
  sanctions: { label: string; sub: string };   // "Clear · 0/13" / "Positive · 100%"
  pep: { label: string; sub: string };
  adverseMedia: { label: string; sub: string };
  uboRca: { label: string; sub: string };
  dispositionLabel: string;  // "Standard CDD." | "Cleared." | "EDD continuance." | "Prohibited."
  dispositionSub: string;    // "onboarding may proceed…"
}

// ── Section 09 — Statutory action & reports filed ───────────────────────────

export interface SCRStatutoryRow {
  ref: string;               // 9.1
  bold?: boolean;
  label: string;
  detail: string;
  rightRef: string;
}

export interface SCRStatutoryFilingRow {
  authority: string;
  form: string;
  reference: string;
  window: string;
  filed: string;
  state: 'ACKNOWLEDGED' | 'SCHEDULED' | 'PENDING' | 'N/A';
}

export interface SCRStatutoryAction {
  rows: SCRStatutoryRow[];
  filings?: SCRStatutoryFilingRow[];  // present for prohibited disposition
}

// ── Section 10 — Tipping-off, retention & record-keeping ────────────────────

export interface SCRRetentionRow {
  ref: string;               // 10.1
  bold?: boolean;
  label: string;
  detail: string;
  rightRef: string;
}

// ── Section 11 — Reviewer chain & four-eyes governance ──────────────────────

export interface SCRAdjudicationChainRow {
  stage: string;             // "1 · screen"
  role: string;
  person: string;
  action: string;
  timeGst: string;
  state: SCRAdjudicationState;
}

export interface SCRReviewerChain {
  chain: SCRAdjudicationChainRow[];
  independence: string;
  conflictOfInterest: string;
  distribution: string;
  notification: string;
}

// ── Sections 12 & 13 — Indices ───────────────────────────────────────────────

export interface SCRAuthorityEntry {
  ref: string;               // [01]
  citation: string;          // bold part
  description: string;
}

export interface SCREvidenceEntry {
  ref: string;               // [01]
  id: string;                // ev-81412-A1
  description: string;
}

export interface SCRIndices {
  authorities: SCRAuthorityEntry[];
  evidence: SCREvidenceEntry[];
}

// ── Section 14 — Attestation, cryptographic seal & distribution ─────────────

export interface SCRCryptographicSeal {
  reportDigest: string;      // sha-256 · 7f41 · 8a02 · …
  wormSeqCaseBundle: string; // 04-00212 · hsm-bound · sha-256 a814…fc02
  session: string;
  distribution: string;      // MLRO · QA · IA · AUDITORS (ON REQ.)
}

export interface SCRAttestation {
  certificationText: string;
  seal: SCRCryptographicSeal;
}

// ── Regulatory basis bar ─────────────────────────────────────────────────────

export interface SCRRegulatoryBasisBar {
  badges: string[];          // "RETENTION ACTIVE" | "CABINET RES. 134/2025 ART. 1S – STR IMMEDIATE-NOTIFY"
  rightLabel: string;        // "LBMA RGG V9 · STEP 5"
}

// ── Root SCR document ────────────────────────────────────────────────────────

export interface ScreeningComplianceReport {
  // Meta
  disposition: SCRDisposition;
  pageCount: number;          // default 14
  totalSections: number;      // default 14
  totalParagraphs: number;    // default 88

  // Cover
  docControl: SCRDocumentControl;
  coverSummary: SCRCoverSummary;
  regulatoryBasisBar: SCRRegulatoryBasisBar;

  // Sections
  executiveSummary: SCRExecutiveSummary;
  subjectOfRecord: SCRSubjectOfRecord;
  trigger: SCRTrigger;
  methodology: SCRMethodology;
  domainI: SCRDomainI;
  domainIIIII: SCRDomainIIIII;
  domainIV: SCRDomainIV;
  aggregateRisk: SCRAggregateRisk;
  statutoryAction: SCRStatutoryAction;
  retentionRows: SCRRetentionRow[];
  reviewerChain: SCRReviewerChain;
  indices: SCRIndices;
  attestation: SCRAttestation;

  // Footer authority citations (bottom of every page)
  footerCitations: string;
}
