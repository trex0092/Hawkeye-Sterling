"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { formatDMYTime } from "@/lib/utils/dateFormat";

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
  /** localStorage keys backing this panel — cleared by the × button.
   *  Empty list means the panel has no clearable client-side store
   *  (e.g. EWRA which is server-rendered or audit-chain which is
   *  append-only by spec). */
  storageKeys: string[];
  /** True iff this panel's data is append-only by regulatory design
   *  (audit chain). Disables the × delete button with a tooltip. */
  appendOnly: boolean;
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
      storageKeys: ["hawkeye.policies.v1"],
      appendOnly: false,
    },
    {
      key: "ewra",
      title: "Enterprise-Wide Risk Assessment",
      description: "FATF R.1 — annual EWRA + BWRA approved by Board.",
      href: "/ewra",
      status: ewra?.generatedAt ? "ready" : "missing",
      detail: ewra?.generatedAt ? `Last generated ${fmtDate(ewra.generatedAt)}` : "Not yet generated — run /ewra to produce",
      ...(ewra?.generatedAt !== undefined ? { lastUpdatedAt: ewra.generatedAt } : {}),
      storageKeys: ["hawkeye.ewra.v1"],
      appendOnly: false,
    },
    {
      key: "cases",
      title: "Case files (CDD / EDD / STR)",
      description: "Sample CDD packs, EDD investigations, STR drafts, freeze decisions.",
      href: "/cases",
      status: caseCount >= 10 ? "ready" : caseCount > 0 ? "partial" : "missing",
      detail: `${caseCount} cases on file`,
      count: caseCount,
      storageKeys: ["hawkeye.cases.v"],
      appendOnly: false,
    },
    {
      key: "audit-chain",
      title: "Audit chain",
      description: "FNV-1a tamper-evident chain — every disposition + override + freeze.",
      href: "/audit-trail",
      status: auditCount >= 100 ? "ready" : auditCount > 0 ? "partial" : "missing",
      detail: `${auditCount} entries`,
      count: auditCount,
      storageKeys: ["hawkeye.audit"],
      appendOnly: true, // Layer-4 spec — append-only, ten-year retention
    },
    {
      key: "training",
      title: "Training register",
      description: "Annual AML/CFT training completion log — required by FDL 10/2025.",
      href: "/training",
      status: trainingCount >= 5 ? "ready" : trainingCount > 0 ? "partial" : "missing",
      detail: `${trainingCount} training records`,
      count: trainingCount,
      storageKeys: ["hawkeye.training"],
      appendOnly: false,
    },
    {
      key: "onboarding",
      title: "Onboarding records",
      description: "Customer onboarding pipeline outputs — guided wizard sign-offs.",
      href: "/operations/onboard",
      status: onboardingCount >= 5 ? "ready" : onboardingCount > 0 ? "partial" : "missing",
      detail: `${onboardingCount} onboarded subjects`,
      count: onboardingCount,
      storageKeys: ["hawkeye.onboarding.v1"],
      appendOnly: false,
    },
  ];
}

// Per-panel +/✎/× action buttons.
//   · +  → opens the source module on a fresh "create" intent
//          (?action=add — the source module can choose to honour or
//          ignore; failure is graceful, the destination just renders
//          its normal page)
//   · ✎  → opens the source module on its standard view
//   · ×  → confirms with the operator, then clears the localStorage
//          keys that back this panel and refreshes the page state.
//          Disabled with a tooltip on the audit-chain panel since
//          Layer-4 spec says append-only / ten-year retention.
function PanelActions({ panel, onChanged }: { panel: Panel; onChanged: () => void }) {
  const baseBtn =
    "inline-flex items-center justify-center w-7 h-7 rounded border font-mono text-12 leading-none transition";
  const addEditCls = `${baseBtn} border-hair-2 text-ink-2 hover:text-brand hover:border-brand bg-bg-1`;
  const deleteCls = `${baseBtn} border-hair-2 text-ink-2 hover:text-red-700 hover:border-red-300 bg-bg-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-ink-2 disabled:hover:border-hair-2`;
  const handleClear = () => {
    if (panel.appendOnly) return;
    if (panel.storageKeys.length === 0) return;
    const ok = window.confirm(
      `Clear all "${panel.title}" entries from this browser?\n\n` +
        `This removes localStorage keys: ${panel.storageKeys.join(", ")}.\n\n` +
        `Server-persisted records (Netlify Blobs / case vault) are unaffected.`,
    );
    if (!ok) return;
    for (const key of panel.storageKeys) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* localStorage unavailable / quota — silent */
      }
    }
    onChanged();
  };
  return (
    <div className="flex items-center gap-1">
      <Link
        href={`${panel.href}?action=add`}
        aria-label={`Add ${panel.title}`}
        title={panel.appendOnly ? "Audit chain entries are appended automatically" : `Add to ${panel.title}`}
        className={addEditCls}
      >
        +
      </Link>
      <Link
        href={panel.href}
        aria-label={`Edit ${panel.title}`}
        title={`Edit ${panel.title}`}
        className={addEditCls}
      >
        ✎
      </Link>
      <button
        type="button"
        onClick={handleClear}
        disabled={panel.appendOnly}
        aria-label={`Clear ${panel.title}`}
        title={
          panel.appendOnly
            ? "Append-only — Layer-4 audit chain has 10-year retention by FDL 10/2025 Art.20"
            : `Clear ${panel.title} from this browser (local data only)`
        }
        className={deleteCls}
      >
        ×
      </button>
    </div>
  );
}

export default function InspectionRoomPage() {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");

  useEffect(() => {
    setPanels(buildPanels());
    setGeneratedAt(formatDMYTime(new Date()));
  }, []);

  const refresh = () => {
    setPanels(buildPanels());
    setGeneratedAt(formatDMYTime(new Date()));
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
        moduleNumber={30}
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
          className="text-11 font-mono px-3 py-1.5 rounded border font-semibold"
          style={{ color: "#7c3aed", borderColor: "#7c3aed", background: "rgba(124,58,237,0.07)" }}
        >
          PDF
        </button>
        <button
          type="button"
          onClick={refresh}
          className="px-2 py-1 text-12 font-mono border border-green/40 rounded text-green bg-green-dim hover:bg-green-dim/70"
        >
          ↻
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
            <div className="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
              <h2 className="text-14 font-semibold text-ink-0 m-0">{p.title}</h2>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 uppercase tracking-wide-3 border ${STATUS_BADGE[p.status].cls}`}
                >
                  {STATUS_BADGE[p.status].label}
                </span>
                <PanelActions panel={p} onChanged={refresh} />
              </div>
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
