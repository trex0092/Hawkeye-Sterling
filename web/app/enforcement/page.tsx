"use client";

import { useMemo } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

// Enforcement Tracker — calendar of regulatory deadlines (MoE annual
// report, FIU STR reconciliation, CDD review dates, etc.). The MLRO
// sees what's coming up and what's overdue.

interface Deadline {
  id: string;
  title: string;
  due: string; // YYYY-MM-DD
  authority: string;
  cadence: "annual" | "quarterly" | "monthly" | "ad-hoc";
  notes?: string;
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
    title: "FIU STR / SAR quarterly reconciliation",
    due: "2026-06-30",
    authority: "UAE FIU",
    cadence: "quarterly",
    notes:
      "Reconcile filed STRs against FIU-received list; investigate any mismatch within 30 days.",
  },
  {
    id: "lbma-audit",
    title: "LBMA Responsible Gold Guidance audit",
    due: "2026-09-15",
    authority: "LBMA",
    cadence: "annual",
    notes:
      "Independent Step-4 audit against LBMA RGG v9. Auditor must be from the LBMA accredited list.",
  },
  {
    id: "cdd-review-tier1",
    title: "Tier-1 EDD refresh sweep",
    due: "2026-05-31",
    authority: "Internal",
    cadence: "annual",
    notes:
      "Full EDD refresh on every active tier-1 PEP and high-risk customer. Board reviews output.",
  },
  {
    id: "sanctions-list-board",
    title: "Sanctions-list effectiveness board review",
    due: "2026-07-15",
    authority: "Internal",
    cadence: "quarterly",
    notes:
      "Board confirms false-positive rate ≤ 1.0% target and reviews any material list-refresh delays.",
  },
  {
    id: "training-renewal",
    title: "AML/CFT staff training renewal cycle",
    due: "2026-06-18",
    authority: "Internal",
    cadence: "annual",
    notes:
      "All AML/CFT team members must have completed refresher training within 12 months. Per FDL 10/2025 Art.16.",
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
                className="bg-white border border-hair-2 rounded-lg p-4"
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <h3 className="text-13 font-semibold text-ink-0 m-0">
                    {d.title}
                  </h3>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-10 font-semibold uppercase ${tone}`}
                  >
                    {label}
                  </span>
                </div>
                <div className="font-mono text-10 text-ink-3 mb-2">
                  {d.authority} · due {d.due} · {d.cadence}
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
