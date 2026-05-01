export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export interface RegulatoryCalendarResult {
  obligations: Array<{
    obligation: string;
    frequency: string;
    deadline: string;
    legalBasis: string;
    filingMethod: string;
    notes?: string;
    category: "reporting" | "filing" | "review" | "training" | "registration";
  }>;
}

const FALLBACK: RegulatoryCalendarResult = {
  obligations: [
    {
      obligation: "Cash Transaction Report (CTR) — filing for cash transactions ≥ AED 55,000",
      frequency: "Per transaction (same business day)",
      deadline: "Same business day as the transaction",
      legalBasis: "UAE FDL 10/2025 Art.17; Cabinet Decision 10/2019 (AED 55,000 threshold)",
      filingMethod: "goAML portal (https://goaml.uae.gov.ae) — CTR submission form",
      notes: "Applies to all licensed financial institutions and DNFBPs. Each qualifying transaction is a separate filing obligation. No minimum threshold — all cash ≥ AED 55,000 must be reported regardless of relationship status.",
      category: "reporting",
    },
    {
      obligation: "Suspicious Transaction Report (STR) — filing for suspected ML/TF/PF activity",
      frequency: "As required upon MLRO determination of suspicion",
      deadline: "Within 2 business days of the MLRO's determination that grounds for suspicion exist",
      legalBasis: "UAE FDL 10/2025 Art.17(1); FATF R.20",
      filingMethod: "goAML portal — STR submission form with narrative, transaction details, and subject information",
      notes: "The 2-business-day clock starts from MLRO determination, not from when the alert was first generated. Do not tip off the customer (FDL 10/2025 Art.20). STRs can be filed for attempted transactions that were declined.",
      category: "reporting",
    },
    {
      obligation: "EOCN Sanctions List Screening — all customers and transactions",
      frequency: "Real-time / same day upon list updates",
      deadline: "Screening must be conducted upon each EOCN list update (list is updated on an ad hoc basis)",
      legalBasis: "UAE FDL 10/2025 Art.23; Cabinet Decision 74/2020 (targeted financial sanctions); UNSCR 1267 (Al-Qaeda/ISIL) and UNSCR 1373 (terrorism)",
      filingMethod: "Internal screening system (must be configured to load EOCN list updates same day); hits reported via goAML Immediate Notification for confirmed matches",
      notes: "UAE EOCN list includes all UN Security Council designations plus UAE domestic designations. Any confirmed match requires immediate asset freeze and notification to UAE competent authorities. Foreign sanctions lists (OFAC, EU, UK) should also be screened as best practice.",
      category: "reporting",
    },
    {
      obligation: "Enterprise-Wide Risk Assessment (EWRA) — annual review and Board approval",
      frequency: "Annual minimum; ad hoc upon material business change",
      deadline: "Within 12 months of the previous EWRA approval; Board approval required before the anniversary date",
      legalBasis: "UAE FDL 10/2025 Art.5; CBUAE AML/CFT Guidelines §3; FATF R.1",
      filingMethod: "Internal document — Board of Directors formal approval required. CBUAE may request copy during inspection.",
      notes: "EWRA must cover all four risk dimensions: customer, product/service, geographic, and delivery channel. Must assess both inherent and residual risk. Board sign-off (not sub-committee delegation) is mandatory. FATF grey-list status changes may require ad hoc EWRA update.",
      category: "review",
    },
    {
      obligation: "AML/CFT Annual Training — all staff",
      frequency: "Annual (minimum); role-specific training may require higher frequency",
      deadline: "All staff must complete mandatory AML/CFT training within each calendar year. New staff must complete within 30 days of joining.",
      legalBasis: "UAE FDL 10/2025 Art.20; CBUAE AML Training Requirements; FATF R.18",
      filingMethod: "Internal training records; completion certificates retained in personnel files for minimum 5 years. Training records may be requested by CBUAE during inspection.",
      notes: "100% completion is required — no exemptions. Training must be updated to reflect regulatory changes (e.g., FDL 10/2025). Role-specific training required for MLRO, compliance team, and relationship managers. MLRO must complete CBUAE-approved specialist training.",
      category: "training",
    },
    {
      obligation: "Board AML/CFT Report — quarterly Board MIS reporting",
      frequency: "Quarterly",
      deadline: "Within 45 days of the end of each quarter (Q1: 15 May; Q2: 15 August; Q3: 15 November; Q4: 15 February)",
      legalBasis: "UAE FDL 10/2025 Art.5(2); CBUAE AML/CFT Guidelines §3.2",
      filingMethod: "Internal Board paper — submitted to Board of Directors. MLRO prepares; Board Chairman acknowledges receipt and reviews.",
      notes: "Report must cover: STR/CTR statistics, training completion, open audit findings, regulatory developments, and MLRO assessment of overall programme effectiveness. Board acknowledgement must be documented in Board minutes.",
      category: "reporting",
    },
    {
      obligation: "goAML Registration — renewal and credentials maintenance",
      frequency: "Annual renewal",
      deadline: "1 July each year (goAML registration renewal cycle)",
      legalBasis: "UAE FDL 10/2025 Art.17; CBUAE goAML Circular",
      filingMethod: "goAML portal — renewal application submitted by MLRO. New MLRO appointments must update goAML credentials within 30 days of appointment.",
      notes: "MLRO must have active goAML credentials at all times. On MLRO change, outgoing MLRO's credentials must be deactivated and new MLRO registered. Multi-factor authentication required for all goAML users.",
      category: "registration",
    },
    {
      obligation: "CBUAE Prudential Return — AML/CFT section (licensed financial institutions)",
      frequency: "Annual",
      deadline: "31 July each year (covers preceding calendar year)",
      legalBasis: "CBUAE Prudential Returns Framework; UAE FDL 10/2025 Art.5",
      filingMethod: "CBUAE Supervisory Portal — electronic submission",
      notes: "Applies to CBUAE-licensed banks, finance companies, exchange houses, and insurance companies. Includes: STR/CTR filing statistics, training completion data, AML audit findings, senior management appointments (MLRO), and programme self-assessment. DNFBPs (non-CBUAE regulated) report to their sector regulator.",
      category: "filing",
    },
    {
      obligation: "UBO Register Filing — beneficial ownership declaration (mainland companies)",
      frequency: "Upon incorporation and within 30 days of any change in beneficial ownership",
      deadline: "Upon incorporation; within 30 days of any subsequent change",
      legalBasis: "Cabinet Decision 58/2020 (UBO Register); UAE FDL 10/2025 Art.11",
      filingMethod: "UAE Ministry of Economy UBO Register portal (for mainland companies); relevant free zone authority for free zone entities",
      notes: "25% ownership threshold for UBO identification. Where no natural person meets 25% threshold, senior managing official must be declared. Penalties for non-filing: AED 50,000–100,000 per Cabinet Decision 58/2020.",
      category: "filing",
    },
    {
      obligation: "AML Policy Review — annual review and Board approval",
      frequency: "Annual minimum; upon material regulatory change",
      deadline: "Annual review — within 12 months of previous Board approval. Must be updated within 30 days of any material regulatory change (e.g., new FDL, CBUAE circular).",
      legalBasis: "UAE FDL 10/2025 Art.5; CBUAE AML/CFT Guidelines §2; FATF R.18",
      filingMethod: "Internal document — Board approval required. Current version must be accessible to all relevant staff. CBUAE may request copy during inspection.",
      notes: "AML Policy must be updated to reflect UAE FDL 10/2025 (replacing FDL 20/2018). Must include: EWRA methodology, CDD/EDD procedures, STR/CTR procedures, PEP policy, tipping off prohibition, sanctions procedures, and PF provisions.",
      category: "review",
    },
    {
      obligation: "Independent AML Audit — external/internal audit of AML programme",
      frequency: "Annual (external); quarterly (internal/compliance testing)",
      deadline: "Annual external audit to be completed and reported to Board within each calendar year; report available to CBUAE on request",
      legalBasis: "UAE FDL 10/2025 Art.5; CBUAE AML/CFT Guidelines §8; FATF R.18",
      filingMethod: "Internal Board paper (audit report); CBUAE may request copy during inspection or themed review",
      notes: "External auditor must be independent of the AML function. Audit scope should cover all AML programme pillars. Findings and management responses must be documented. Critical findings require Board-level action plan within 30 days.",
      category: "review",
    },
    {
      obligation: "MLRO Appointment / Change Notification — notify regulator of MLRO appointment or change",
      frequency: "Upon appointment or change of MLRO",
      deadline: "Within 30 days of MLRO appointment or departure",
      legalBasis: "UAE FDL 10/2025 Art.9 (MLRO appointment requirements); CBUAE No-Objection requirements for MLRO",
      filingMethod: "CBUAE Supervisory Portal — regulatory notification form; goAML credentials update for new MLRO",
      notes: "CBUAE no-objection required before MLRO appointment (for CBUAE-licensed entities). MLRO must meet fit and proper requirements. Deputies should also be registered in goAML. In free zones, notify relevant free zone regulator (DFSA, ADGM, etc.).",
      category: "registration",
    },
    {
      obligation: "Targeted Financial Sanctions (TFS) Freeze — immediate asset freeze on EOCN/UN designation",
      frequency: "Immediate upon new designation",
      deadline: "Without delay (same day) upon identification of a match to a newly designated person/entity",
      legalBasis: "Cabinet Decision 74/2020 (TFS implementation); UN Security Council Resolutions; UAE FDL 10/2025 Art.23",
      filingMethod: "goAML — Immediate Notification to UAE FIU; CBUAE notification for licensed financial institutions; written confirmation to competent authority",
      notes: "No minimum threshold — all assets and economic resources of designated persons/entities must be frozen. 'Without delay' means same day in UAE implementation. Prohibition on making funds available applies even if account balance is zero.",
      category: "reporting",
    },
    {
      obligation: "KYC Refresh — periodic CDD review of existing customers",
      frequency: "High-risk: annual; Medium-risk: 3-yearly; Low-risk: 5-yearly; plus event-driven triggers",
      deadline: "Per risk-tiered schedule; event-driven triggers must be acted upon within 30 days of trigger event",
      legalBasis: "UAE FDL 10/2025 Art.15 (ongoing monitoring); FATF R.10 (ongoing due diligence); CBUAE AML/CFT Guidelines §4.4",
      filingMethod: "Internal customer file management system — updated KYC documentation stored against customer record",
      notes: "Event-driven triggers include: adverse media hit, sanctions screening match, significant change in transaction behaviour, change in customer circumstances, expiry of identity documents, or PEP re-classification. Relationships where documentation cannot be refreshed should be considered for exit.",
      category: "review",
    },
  ],
};

export async function POST(req: Request) {
  let body: { institutionType?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  // Deterministic route — no AI call. Returns static UAE AML/CFT regulatory calendar.
  void body; // institutionType reserved for future filtering
  return NextResponse.json({ ok: true, ...FALLBACK });
}
