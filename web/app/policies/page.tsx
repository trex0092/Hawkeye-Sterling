"use client";

import { useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

// Policies (SOP vault) — your charter, redlines, risk appetite, sector
// policies. Brain cites these inline on every disposition. Versioned
// locally; operators can edit inline.

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
                      className="bg-white border border-hair-2 rounded-lg p-4"
                    >
                      <div className="flex items-baseline justify-between mb-2">
                        <h3 className="text-13 font-semibold text-ink-0 m-0">
                          {p.title}
                        </h3>
                        <span className="font-mono text-10 text-ink-3">
                          reviewed {p.lastReviewed}
                        </span>
                      </div>
                      {editing === p.id ? (
                        <>
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={5}
                            className="w-full text-12 px-3 py-2 rounded border border-hair-2 bg-white text-ink-0"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveEdit(p.id)}
                              className="text-11 font-semibold px-3 py-1 rounded bg-ink-0 text-white"
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
