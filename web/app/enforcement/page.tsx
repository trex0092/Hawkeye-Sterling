"use client";

import { useMemo } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface Deadline {
  id: string;
  title: string;
  due: string; // YYYY-MM-DD
  authority: string;
  cadence: "annual" | "quarterly" | "monthly" | "ad-hoc";
  notes?: string;
}

/** "2026-05-31" → "31/05/2026" */
function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const DEADLINES: Deadline[] = [
  {
    id: "moe-annual",
    title: "MoE AML Compliance Annual Report",
    due: "2026-12-31",
    authority: "UAE MoE",
    cadence: "annual",
    notes:
      "DNFBP reporting-entity annual report. Due 31 December each year per MoE Circular 3/2025.",
  },
  {
    id: "fiu-recon",
    title: "FIU STR / SAR Quarterly Reconciliation",
    due: "2026-06-30",
    authority: "UAE FIU",
    cadence: "quarterly",
    notes:
      "Reconcile filed STRs against FIU-received list; investigate any mismatch within 30 days.",
  },
  {
    id: "lbma-audit",
    title: "LBMA Responsible Gold Guidance — Step-4 Audit",
    due: "2026-09-15",
    authority: "LBMA",
    cadence: "annual",
    notes:
      "Independent Step-4 audit against LBMA RGG v9. Auditor must be from the LBMA accredited list.",
  },
  {
    id: "cdd-review-tier1",
    title: "Tier-1 EDD Refresh Sweep",
    due: "2026-05-31",
    authority: "Internal",
    cadence: "annual",
    notes:
      "Full EDD refresh on every active tier-1 PEP and high-risk customer. Board reviews output.",
  },
  {
    id: "sanctions-list-board",
    title: "Sanctions-List Effectiveness Board Review",
    due: "2026-07-15",
    authority: "Internal",
    cadence: "quarterly",
    notes:
      "Board confirms false-positive rate ≤ 1.0% target and reviews any material list-refresh delays.",
  },
  {
    id: "training-renewal",
    title: "AML/CFT Staff Training Renewal Cycle",
    due: "2026-06-18",
    authority: "Internal",
    cadence: "annual",
    notes:
      "All AML/CFT team members must have completed refresher training within 12 months. Per FDL 10/2025 Art.16.",
  },
  {
    id: "eocn-declaration",
    title: "EOCN Annual Mineral Supply-Chain Declaration",
    due: "2026-03-31",
    authority: "EOCN",
    cadence: "annual",
    notes:
      "Annual responsible-sourcing declaration submitted to the Emirates Official Cargoes Network. Covers all upstream smelters and refiners per OECD Annex II 5-Step framework. Deadline 31 March.",
  },
  {
    id: "ubo-register",
    title: "UBO Register Annual Verification",
    due: "2026-06-30",
    authority: "UAE MoE / MOEC",
    cadence: "annual",
    notes:
      "Verify and re-file the Beneficial Ownership Register with the relevant authority. Any change in UBO must be reported within 15 business days per Cabinet Decision 58/2020.",
  },
  {
    id: "risk-appetite",
    title: "Risk Appetite Statement Annual Review",
    due: "2026-04-30",
    authority: "Internal / Board",
    cadence: "annual",
    notes:
      "Board reviews and re-approves the AML/CFT Risk Appetite Statement per FDL 10/2025 Art.4. Output feeds the Entity-Wide Risk Assessment update.",
  },
  {
    id: "board-aml-q2",
    title: "Board AML/CFT Quarterly Report — Q2 2026",
    due: "2026-07-31",
    authority: "Internal / Board",
    cadence: "quarterly",
    notes:
      "MLRO presents quarterly AML/CFT metrics to the Board Audit Committee per FDL 10/2025 Art.15. Includes STR count, screening volumes, training status, and open corrective actions.",
  },
  {
    id: "goaml-test",
    title: "goAML System Connectivity & Version Test",
    due: "2026-05-15",
    authority: "UAE FIU",
    cadence: "annual",
    notes:
      "Annual end-to-end connectivity test of the goAML Web submission system. Confirm current software version, test report submission in sandbox, and update MLRO credentials. FIU technical bulletin TBN-2025-04.",
  },
  {
    id: "pf-risk-assessment",
    title: "Proliferation Financing Risk Assessment Update",
    due: "2026-07-31",
    authority: "Internal / CBUAE",
    cadence: "annual",
    notes:
      "Standalone PF risk assessment required under FATF R.1 and UAE National PF Risk Assessment 2024. Covers dual-use goods exposure, DPRK/Iran nexus, and effectiveness of targeted financial sanctions controls.",
  },
  {
    id: "tier2-cdd-review",
    title: "Tier-2 High-Risk CDD Periodic Review",
    due: "2026-09-30",
    authority: "Internal",
    cadence: "annual",
    notes:
      "CDD refresh for all high-risk (non-PEP) customers not refreshed in 12 months. Minimum: updated ID documents, re-run sanctions screen, refresh source-of-funds narrative. Per FDL 10/2025 Art.11.",
  },
  {
    id: "sanctions-system-test",
    title: "Sanctions Screening System Effectiveness Test",
    due: "2026-05-30",
    authority: "Internal",
    cadence: "annual",
    notes:
      "Annual test of the automated sanctions screening engine using CBUAE-prescribed test names and entities. Measure false-negative rate; document results. CBUAE Guidance on Sanctions Compliance, para 4.3.",
  },
];

function daysUntil(iso: string): number {
  return Math.round(
    (Date.parse(iso) - Date.now()) / (24 * 60 * 60 * 1_000),
  );
}

export default function EnforcementPage() {
  const sorted = useMemo(
    () => [...DEADLINES].sort((a, b) => Date.parse(a.due) - Date.parse(b.due)),
    [],
  );

  return (
    <ModuleLayout narrow>
      <div className="max-w-4xl mx-auto px-8 py-10">
        <ModuleHero
          eyebrow="Module 18 · Regulatory calendar"
          title="Enforcement"
          titleEm="tracker."
          intro={
            <>
              <strong>Every regulator-mandated deadline in one place.</strong>{" "}
              MoE annual reports, FIU quarterly reconciliations, LBMA Step-4
              audits, internal EDD sweeps — sorted by due date, colour-coded
              by urgency.
            </>
          }
        />

        <div className="mt-6 space-y-2">
          {sorted.map((d) => {
            const days = daysUntil(d.due);
            const tone =
              days < 0
                ? "bg-red-dim text-red"
                : days <= 14
                  ? "bg-amber-dim text-amber"
                  : days <= 60
                    ? "bg-blue-dim text-blue"
                    : "bg-green-dim text-green";
            const label =
              days < 0
                ? `${Math.abs(days)}d overdue`
                : days === 0
                  ? "today"
                  : `in ${days}d`;
            return (
              <div
                key={d.id}
                className="bg-bg-panel border border-hair-2 rounded-lg p-4"
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <h3 className="text-13 font-semibold text-ink-0 m-0">
                    {d.title}
                  </h3>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-10 font-semibold uppercase whitespace-nowrap ${tone}`}
                  >
                    {label}
                  </span>
                </div>
                <div className="font-mono text-10 text-ink-3 mb-2">
                  {d.authority} · due {fmtDate(d.due)} · {d.cadence}
                </div>
                {d.notes && (
                  <p className="text-11 text-ink-2 m-0 leading-relaxed">
                    {d.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ModuleLayout>
  );
}
