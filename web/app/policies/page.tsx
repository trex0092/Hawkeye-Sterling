"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

// Policies (SOP vault) — your charter, redlines, risk appetite, sector
// policies. Brain cites these inline on every disposition. Versioned
// locally; operators can edit inline.

function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

interface Policy {
  id: string;
  section: string;
  title: string;
  body: string;
  lastReviewed: string;
}

const STORAGE = "hawkeye.policies.v1";

const DEFAULT_POLICIES: Policy[] = [
  {
    id: "charter",
    section: "Charter",
    title: "MLRO Charter",
    body:
      "The MLRO is independent of commercial lines. Decisions to file / withhold STR are the MLRO's alone; no commercial pressure overrides the MLRO's duty under FDL 10/2025 Art.15. The MLRO reports quarterly to the Board Audit Committee.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "redline-freeze",
    section: "Redlines",
    title: "Hard-stop freeze triggers",
    body:
      "Immediate freeze on: (1) any OFAC SDN / UN Consolidated match ≥ 92%; (2) any transaction where counterparty is a CAHRA-listed jurisdiction AND over-invoicing > 20%; (3) any DPRK / Iran / Syria nexus. No commercial override. Freeze held until the MLRO dispositions.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "risk-appetite",
    section: "Risk Appetite",
    title: "Tier risk appetite",
    body:
      "Zero-tolerance for tier-1 sanctions hits. Low tolerance for tier-1 PEPs (CEO sign-off required). Medium tolerance for domestic PEPs with EDD complete. High tolerance for clear-screening domestic customers with standard CDD.",
    lastReviewed: "2026-03-12",
  },
  {
    id: "dpms-kpis",
    section: "Sector: DPMS",
    title: "DPMS KPI framework",
    body:
      "Monthly KPIs: CDD completion rate ≥ 98%, DPMSR filing < 30 days from trigger, UBO identification rate ≥ 95%, high-risk EDD completion ≤ 14 days, false-positive rate ≤ 1.0%. Board reviews KPIs quarterly.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "pep-policy",
    section: "PEP Policy",
    title: "PEP handling — FATF R.12 alignment",
    body:
      "All PEPs (foreign / domestic / international-org + family + close associates) get EDD. Tier-1 requires CEO + Board Chair approval. Source-of-wealth triangulation against public filings mandatory. Thrice-daily ongoing monitoring enrolment automatic.",
    lastReviewed: "2026-03-20",
  },
  {
    id: "retention",
    section: "Data",
    title: "Record retention",
    body:
      "10-year retention on all CDD records, STR artefacts, case timelines, audit-chain entries, goAML envelopes, and ongoing-monitoring snapshots per FDL 10/2025 Art.24. Encrypted at rest. Access audited.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "customer-acceptance",
    section: "Onboarding",
    title: "Customer Acceptance Policy",
    body:
      "No business relationship is established until: (1) CDD is complete and documented; (2) sanctions screen returns clear or MLRO-approved; (3) source-of-funds narrative is obtained for any cash or equivalent > AED 55,000; (4) beneficial ownership ≥ 25% is identified and verified. Shell companies with no identifiable UBO are declined.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "wire-transfer",
    section: "Onboarding",
    title: "Wire Transfer & Payment Policy",
    body:
      "All outbound wires > AED 3,500 require full originator and beneficiary information per FATF R.16. Third-party payments are prohibited without prior MLRO approval. Payments to jurisdictions on the FATF grey/black list require Board-level sign-off and enhanced due diligence on end-use. Correspondent bank accounts must be pre-approved and listed in the authorised counterparty register.",
    lastReviewed: "2026-03-28",
  },
  {
    id: "str-triage",
    section: "Reporting",
    title: "STR Triage & Filing Policy",
    body:
      "Any red-flag event must be escalated to the MLRO within 24 hours. MLRO has 7 working days to triage and determine whether to file. goAML submission must be completed within 30 calendar days of the trigger event. No tipping-off: staff must not disclose the existence of an STR to the subject or any third party. MLRO may extend the triage window by 7 days with documented rationale.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "aml-training",
    section: "Governance",
    title: "AML/CFT Training Policy",
    body:
      "All staff with AML/CFT responsibilities must complete initial training before onboarding and annual refresher training thereafter. Training covers: FATF recommendations, UAE FDL 10/2025, red-flag typologies, goAML filing, and four-eyes procedures. MLRO maintains a training register. Non-completion blocks system access after a 14-day grace period. Board members receive annual AML awareness briefing.",
    lastReviewed: "2026-03-15",
  },
  {
    id: "sanctions-screening",
    section: "Screening",
    title: "Sanctions Screening Policy",
    body:
      "All customers, UBOs, and counterparties are screened at onboarding and on every list refresh (minimum 3× daily). Threshold for a positive match: ≥ 85% fuzzy score against OFAC SDN, UN Consolidated, EU Consolidated, UK HMT, or EOCN. Any match ≥ 85% triggers an automatic freeze and MLRO notification. The false-positive rate target is ≤ 1.0%; breaches are reported to the Board.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "nested-structures",
    section: "Onboarding",
    title: "Nested Structures & Shell Company Policy",
    body:
      "No customer relationship with a legal entity whose UBO cannot be identified through a maximum of two levels of corporate ownership. Any structure with a nominee director or nominee shareholder requires independent verification of the beneficial owner's identity and source of wealth. Bearer shares are not accepted. Regulated financial intermediaries (banks, funds) operating under equivalent AML regimes may be accepted at CO level without piercing to UBO.",
    lastReviewed: "2026-03-22",
  },
  {
    id: "cash-policy",
    section: "Screening",
    title: "Cash & High-Value Dealer Policy",
    body:
      "Cash transactions ≥ AED 55,000 (or equivalent) must be reported to the MLRO within one business day. Structuring (splitting transactions to avoid thresholds) is a red flag and triggers immediate escalation. DPMS transactions in precious metals or gemstones above AED 55,000 require full CDD regardless of payment method. No anonymous cash accepted. All cash receipts recorded in the DPMSR register within 24 hours.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "virtual-assets",
    section: "Sector: VASP",
    title: "Crypto & Virtual Asset Policy",
    body:
      "Virtual asset transactions require on-chain address screening against Chainalysis / Elliptic blacklists before settlement. No interaction with unhosted wallets > AED 3,500 without verified KYC. DeFi protocols on the FATF grey-list require MLRO pre-approval. Travel Rule compliance mandatory for all transfers > USD 1,000 equivalent. VASP counterparties must be VARA-licensed or operating under equivalent regulation.",
    lastReviewed: "2026-04-01",
  },
  {
    id: "ongoing-monitoring",
    section: "Governance",
    title: "Ongoing Monitoring Policy",
    body:
      "All active customers are subject to continuous transaction monitoring. Tier-1 (PEP / high-risk) customers: daily name-screen refresh, all transactions reviewed. Tier-2 (medium-risk): weekly screen refresh, transaction monitoring via automated rules. Tier-3 (low-risk): monthly screen refresh, statistical anomaly detection only. Any change in customer profile triggers a full re-KYC within 30 days.",
    lastReviewed: "2026-03-31",
  },
];

function load(): Policy[] {
  if (typeof window === "undefined") return DEFAULT_POLICIES;
  try {
    const raw = window.localStorage.getItem(STORAGE);
    return raw ? JSON.parse(raw) : DEFAULT_POLICIES;
  } catch {
    return DEFAULT_POLICIES;
  }
}

function save(policies: Policy[]) {
  try {
    window.localStorage.setItem(STORAGE, JSON.stringify(policies));
  } catch {
    /* */
  }
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setPolicies(load());
  }, []);

  const startEdit = (p: Policy) => {
    setEditing(p.id);
    setDraft(p.body);
  };

  const saveEdit = (id: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const next = policies.map((p) =>
      p.id === id ? { ...p, body: draft, lastReviewed: today } : p,
    );
    save(next);
    setPolicies(next);
    setEditing(null);
  };

  const sections = Array.from(new Set(policies.map((p) => p.section)));

  return (
    <ModuleLayout narrow>
      <div className="max-w-4xl mx-auto px-8 py-10">
        <ModuleHero
          eyebrow="Module 17 · SOP vault"
          title="Policies"
          titleEm="charter."
          intro={
            <>
              <strong>One source of truth for every rule the brain cites.</strong>{" "}
              Charter, redlines, risk appetite, sector policies — versioned
              and click-to-edit. Every disposition in the audit chain binds
              to the policy revision in effect when the decision was made.
            </>
          }
        />

        <div className="mt-6 space-y-6">
          {sections.map((sec) => (
            <section key={sec}>
              <h2 className="text-10 uppercase tracking-wide-4 font-semibold text-ink-2 mb-2">
                {sec}
              </h2>
              <div className="space-y-2">
                {policies
                  .filter((p) => p.section === sec)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="bg-bg-panel border border-hair-2 rounded-lg p-4"
                    >
                      <div className="flex items-baseline justify-between mb-2">
                        <h3 className="text-13 font-semibold text-ink-0 m-0">
                          {p.title}
                        </h3>
                        <span className="font-mono text-10 text-ink-3">
                          reviewed {fmtDate(p.lastReviewed)}
                        </span>
                      </div>
                      {editing === p.id ? (
                        <>
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={5}
                            className="w-full text-12 px-3 py-2 rounded border border-hair-2 bg-bg-panel text-ink-0"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveEdit(p.id)}
                              className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-bg-0"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditing(null)}
                              className="text-11 font-medium px-3 py-1 rounded text-ink-2"
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-11.5 text-ink-1 leading-relaxed m-0">
                            {p.body}
                          </p>
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            className="mt-2 text-10 font-mono text-brand hover:underline"
                          >
                            edit
                          </button>
                        </>
                      )}
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </ModuleLayout>
  );
}
