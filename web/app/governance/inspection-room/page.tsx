"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

type Status = "ready" | "partial" | "missing";

interface Panel {
  key: string;
  title: string;
  description: string;
  href: string;
  status: Status;
  detail: string;
  count?: number;
  lastUpdatedAt?: number;
}

const STATUS_BADGE: Record<Status, { label: string; cls: string }> = {
  ready:   { label: "✓ Ready",   cls: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  partial: { label: "⚠ Partial", cls: "bg-yellow-50 text-yellow-700 border-yellow-300" },
  missing: { label: "✗ Missing", cls: "bg-red-50 text-red-700 border-red-300" },
};

function safeParse<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function fmtDate(epoch?: number): string {
  if (!epoch) return "—";
  const d = new Date(epoch);
  return d.toLocaleString();
}

function buildPanels(): Panel[] {
  const policies = safeParse<Array<{ id: string; section: string; lastReviewed: string }>>(
    "hawkeye.policies.v1",
  );
  const policyCount = policies?.length ?? 0;
  const policySections = new Set(policies?.map((p) => p.section) ?? []).size;

  const cases = safeParse<unknown[]>("hawkeye.cases.v");
  const caseCount = Array.isArray(cases) ? cases.length : 0;

  const audit = safeParse<unknown[]>("hawkeye.audit");
  const auditCount = Array.isArray(audit) ? audit.length : 0;

  const training = safeParse<{ records?: unknown[] }>("hawkeye.training");
  const trainingCount = training?.records?.length ?? 0;

  const ewra = safeParse<{ generatedAt?: number }>("hawkeye.ewra.v1");

  const onboarding = safeParse<unknown[]>("hawkeye.onboarding.v1");
  const onboardingCount = Array.isArray(onboarding) ? onboarding.length : 0;

  return [
    {
      key: "policies",
      title: "Policy stack",
      description: "Charter, redlines, risk appetite, sector policies — versioned and dated.",
      href: "/policies",
      status: policyCount >= 50 ? "ready" : policyCount > 0 ? "partial" : "missing",
      detail: `${policyCount} policies across ${policySections} sections`,
      count: policyCount,
    },
    {
      key: "ewra",
      title: "Enterprise-Wide Risk Assessment",
      description: "FATF R.1 — annual EWRA + BWRA approved by Board.",
      href: "/ewra",
      status: ewra?.generatedAt ? "ready" : "missing",
      detail: ewra?.generatedAt ? `Last generated ${fmtDate(ewra.generatedAt)}` : "Not yet generated — run /ewra to produce",
      ...(ewra?.generatedAt !== undefined ? { lastUpdatedAt: ewra.generatedAt } : {}),
    },
    {
      key: "cases",
      title: "Case files (CDD / EDD / STR)",
      description: "Sample CDD packs, EDD investigations, STR drafts, freeze decisions.",
      href: "/cases",
      status: caseCount >= 10 ? "ready" : caseCount > 0 ? "partial" : "missing",
      detail: `${caseCount} cases on file`,
      count: caseCount,
    },
    {
      key: "audit-chain",
      title: "Audit chain",
      description: "FNV-1a tamper-evident chain — every disposition + override + freeze.",
      href: "/audit-trail",
      status: auditCount >= 100 ? "ready" : auditCount > 0 ? "partial" : "missing",
      detail: `${auditCount} entries`,
      count: auditCount,
    },
    {
      key: "training",
      title: "Training register",
      description: "Annual AML/CFT training completion log — required by FDL 10/2025.",
      href: "/training",
      status: trainingCount >= 5 ? "ready" : trainingCount > 0 ? "partial" : "missing",
      detail: `${trainingCount} training records`,
      count: trainingCount,
    },
    {
      key: "onboarding",
      title: "Onboarding records",
      description: "Customer onboarding pipeline outputs — guided wizard sign-offs.",
      href: "/operations/onboard",
      status: onboardingCount >= 5 ? "ready" : onboardingCount > 0 ? "partial" : "missing",
      detail: `${onboardingCount} onboarded subjects`,
      count: onboardingCount,
    },
  ];
}

export default function InspectionRoomPage() {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");

  useEffect(() => {
    setPanels(buildPanels());
    setGeneratedAt(new Date().toLocaleString());
  }, []);

  const refresh = () => {
    setPanels(buildPanels());
    setGeneratedAt(new Date().toLocaleString());
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  const readyCount = panels.filter((p) => p.status === "ready").length;
  const partialCount = panels.filter((p) => p.status === "partial").length;
  const missingCount = panels.filter((p) => p.status === "missing").length;
  const overallStatus: Status =
    missingCount === 0 && partialCount === 0
      ? "ready"
      : missingCount === 0
        ? "partial"
        : "missing";

  return (
    <ModuleLayout asanaModule="inspection-room" asanaLabel="Inspection Room">
      <ModuleHero
        eyebrow="Module · Inspection Room"
        title="Regulator-ready"
        titleEm="evidence."
        intro={
          <>
            <strong>Hand this page to a CBUAE / MoE / FIU inspector.</strong>{" "}
            Six evidence areas aggregated from your live data — policies, EWRA,
            cases, audit chain, training, onboarding. Each panel shows
            readiness, last-updated timestamp, and a deep link to the source
            module.
          </>
        }
        kpis={[
          { value: String(readyCount), label: "ready" },
          { value: String(partialCount), label: "partial", tone: partialCount > 0 ? "amber" : undefined },
          { value: String(missingCount), label: "missing", tone: missingCount > 0 ? "red" : undefined },
          { value: STATUS_BADGE[overallStatus].label, label: "overall" },
        ]}
      />

      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={handlePrint}
          className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-brand bg-brand-dim text-brand-deep hover:bg-brand hover:text-white rounded font-semibold"
        >
          Generate inspection PDF
        </button>
        <button
          type="button"
          onClick={refresh}
          className="text-11 font-mono uppercase tracking-wide-3 px-3 py-1.5 border border-hair-2 rounded text-ink-2 hover:text-brand hover:border-brand"
        >
          Refresh
        </button>
        <span className="text-11 text-ink-3 font-mono ml-auto">
          generated {generatedAt}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {panels.map((p) => (
          <div
            key={p.key}
            className="bg-bg-panel border border-hair-2 rounded-lg p-5"
          >
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-14 font-semibold text-ink-0 m-0">{p.title}</h2>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 uppercase tracking-wide-3 border ${STATUS_BADGE[p.status].cls}`}
              >
                {STATUS_BADGE[p.status].label}
              </span>
            </div>
            <p className="text-12 text-ink-2 m-0 mb-3">{p.description}</p>
            <div className="flex items-baseline justify-between text-11 text-ink-2 font-mono">
              <span>{p.detail}</span>
              <Link href={p.href} className="text-brand hover:underline">
                view →
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 text-11 text-ink-3 font-mono">
        v1: PDF export uses the browser print dialog. SVG export and goAML XML
        bundling are tracked for follow-up.
      </div>
    </ModuleLayout>
  );
}
