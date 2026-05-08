"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { formatDMYTime } from "@/lib/utils/dateFormat";
import {
  buildHtmlDoc,
  hsCover,
  hsPage,
  hsFinis,
  hsTable,
  hsSeverityCell,
  hsNarrative,
  hsScorebox,
  type CoverData,
} from "@/lib/reportHtml";
import { AuditTrailViewer } from "@/components/screening/AuditTrailViewer";
import { PerformanceMonitoringDashboard } from "@/components/screening/PerformanceMonitoringDashboard";

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
  } catch (err) {
    console.warn(`[hawkeye] inspection-room safeParse(${key}) failed — returning null:`, err);
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
      } catch (err) {
        console.warn(`[hawkeye] inspection-room removeItem(${key}) failed — overlay may persist:`, err);
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
    if (typeof window === "undefined") return;
    const now = new Date();
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = now.getUTCFullYear();
    const hh = String(now.getUTCHours()).padStart(2, "0");
    const mi = String(now.getUTCMinutes()).padStart(2, "0");
    const reportId = `HWK-INSP-${dd}-${mm}-${yyyy}-${hh}${mi}`;
    const regs = "FDL 10/2025 · 10-year retention · Cabinet Res 134/2025 Art.18";
    const label = "INSPECTION ROOM DOSSIER";

    const overall = overallStatus;
    const verdictBand = overall === "ready" ? "sage" : overall === "partial" ? "amber" : "ember";
    const verdictLabel = STATUS_BADGE[overall].label.replace(/[^A-Za-z ]/g, "").trim();

    const coverData: CoverData = {
      reportId,
      regs,
      module: "MODULE 30 · INSPECTION ROOM",
      title: "Regulator-Ready Evidence Dossier",
      subtitle: "Six evidence areas aggregated for CBUAE / MoE / FIU inspection.",
      subjectLabel: "INSTITUTION",
      subjectName: "Hawkeye Sterling FZE",
      subjectMeta: "DMCC Free Zone · Dubai · United Arab Emirates",
      verdictLabel,
      verdictBand,
      verdictNote: `${readyCount} ready · ${partialCount} partial · ${missingCount} missing`,
      meta: [
        { label: "Generated", value: now.toUTCString().replace(" GMT", " UTC") },
        { label: "Place", value: "Dubai, UAE" },
        { label: "MLRO", value: "L. Fernanda" },
        { label: "Ready panels", value: String(readyCount), sub: "of 6" },
        { label: "Partial panels", value: String(partialCount), sub: "of 6" },
        { label: "Missing panels", value: String(missingCount), sub: "of 6" },
      ],
    };

    const summaryRows: string[][] = panels.map((p) => [
      p.title,
      hsSeverityCell(p.status === "ready" ? "Pass" : p.status === "partial" ? "Review" : "Hit"),
      p.detail,
    ]);

    const cover = hsCover(coverData);
    const summaryPage = hsPage({
      reportId, pageNum: 1, pageTotal: 3, regs, label,
      content: `
        <div class="hs-rule"></div>
        ${hsNarrative(
          `On ${now.toUTCString().replace(" GMT", " UTC")}, Hawkeye Sterling assembled a regulator-ready evidence dossier for inspection by the CBUAE / MoE / FIU. Six evidence areas were checked: Policy stack, Enterprise-Wide Risk Assessment, Case files (CDD/EDD/STR), Audit chain, Training register, and Onboarding records. Overall readiness: <strong>${verdictLabel}</strong>.`,
          true,
        )}
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:14px 0">
          ${hsScorebox(String(readyCount), "READY", "sage")}
          ${hsScorebox(String(partialCount), "PARTIAL", partialCount > 0 ? "amber" : "")}
          ${hsScorebox(String(missingCount), "MISSING", missingCount > 0 ? "ember" : "")}
        </div>
        <div class="hs-rule"></div>
        <h2 class="hs-section-h" style="margin-top:14px">Evidence Areas — Summary</h2>
        ${hsTable(["Area", "Status", "Detail"], summaryRows)}
      `,
    });

    const detailContent = panels.map((p) => `
      <div style="border:0.5px solid var(--hair);padding:14px 18px;margin-bottom:14px;border-radius:4px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:14px;margin-bottom:8px">
          <h3 style="font-family:var(--serif);font-size:16px;margin:0">${p.title}</h3>
          ${hsSeverityCell(p.status === "ready" ? "Pass" : p.status === "partial" ? "Review" : "Hit")}
        </div>
        <p style="font-size:11px;color:var(--ink-2);margin:0 0 6px;line-height:1.5">${p.description}</p>
        <div style="font-family:var(--mono);font-size:10px;color:var(--ink-2)">${p.detail}</div>
        ${p.lastUpdatedAt ? `<div style="font-family:var(--mono);font-size:9px;color:var(--ink-3);margin-top:4px">Last updated: ${new Date(p.lastUpdatedAt).toLocaleString()}</div>` : ""}
        <div style="font-family:var(--mono);font-size:9px;color:var(--ink-3);margin-top:4px">Source module: ${p.href}</div>
      </div>
    `).join("");

    const detailPage = hsPage({
      reportId, pageNum: 2, pageTotal: 3, regs, label,
      content: `<h2 style="margin-top:0">Evidence Areas — Detail</h2>${detailContent}`,
    });

    const provenance = `
      <h2 style="margin-top:0">Audit Trail &amp; Integrity</h2>
      ${hsNarrative(
        "This dossier was assembled deterministically from live operator data at the moment of generation. Each panel deep-links to the underlying source module so an inspector can verify every line item against the operating system of record.",
      )}
      <ul class="hs-findings">
        <li>Generated at <strong>${now.toUTCString().replace(" GMT", " UTC")}</strong>.</li>
        <li>Report ID: <code>${reportId}</code>.</li>
        <li>Retention: 10 years (UAE FDL 10/2025 Art.24).</li>
        <li>Implementing regulation: Cabinet Resolution 134/2025 Art.18.</li>
        <li>FATF baseline: R.1 (EWRA), R.10 (CDD), R.18 (records), R.20 (STR), R.24-25 (UBO).</li>
      </ul>
      ${hsFinis(reportId, 3, 3)}
    `;
    const auditPage = hsPage({
      reportId, pageNum: 3, pageTotal: 3, regs, label, content: provenance,
    });

    const html = buildHtmlDoc({
      title: `Hawkeye Sterling — Inspection Room Dossier ${reportId}`,
      autoprint: true,
      pages: [cover, summaryPage, detailPage, auditPage],
    });

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    if (!opened) {
      // Pop-up blocked — fall back to native print of the live page so the
      // user always gets *something*.
      window.print();
    }
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

      <div className="mt-8 grid grid-cols-1 gap-4">
        <PerformanceMonitoringDashboard />
        <AuditTrailViewer />
      </div>

      <div className="mt-6 text-11 text-ink-3 font-mono">
        v1: PDF export uses the browser print dialog. SVG export and goAML XML
        bundling are tracked for follow-up.
      </div>
    </ModuleLayout>
  );
}
