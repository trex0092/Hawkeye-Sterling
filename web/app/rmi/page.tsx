"use client";

import { useState, useEffect, useMemo } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { RowActions } from "@/components/shared/RowActions";

// Responsible Minerals Initiative — RMAP audit tracker.
// UAE-based precious-metals entities sourcing from CAHRAs (Conflict-Affected
// and High-Risk Areas) must align with RMI/OECD Due Diligence Guidance (DDG).
// Covers 3TG (tantalum, tin, tungsten, gold) and cobalt supply chains.

interface RmiRecommendedAction {
  smelter: string;
  action: string;
  urgency: "immediate" | "3months" | "annual";
  oecdStep: number;
}

interface RmiAssessment {
  ok: boolean;
  portfolioRisk: "critical" | "high" | "medium" | "low";
  portfolioNarrative: string;
  criticalSmelters: string[];
  oecdGaps: string[];
  cahraExposure: string;
  lbmaAlignmentIssues: string[];
  recommendedActions: RmiRecommendedAction[];
  regulatoryExposure: string;
  auditPriority: string[];
}

type MineralType = "gold" | "tantalum" | "tin" | "tungsten" | "cobalt";
type RmapStatus = "conformant" | "active" | "expired" | "not-enrolled" | "suspended";
type CahraRisk = "high" | "medium" | "low";

interface Smelter {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  mineral: MineralType;
  rmapStatus: RmapStatus;
  rmapId: string;
  lastAuditDate: string;
  nextAuditDue: string;
  cahraRisk: CahraRisk;
  activeSupplier: boolean;
  annualVolumeKg?: number;
  flags: string[];
  notes: string;
}

interface OecdStep {
  n: number;
  title: string;
  description: string;
}

interface RmapAuditLog {
  date: string;
  smelterName: string;
  action: string;
  auditor: string;
  outcome: string;
}

const OECD_STEPS: OecdStep[] = [
  { n: 1, title: "Establish strong company management systems", description: "Supply-chain policy, internal controls, grievance mechanism, record-keeping obligations." },
  { n: 2, title: "Identify and assess risk in the supply chain", description: "Map supply chain to source; identify CAHRA-origin material; collect smelter/refiner data." },
  { n: 3, title: "Design and implement a strategy to respond to identified risks", description: "Risk mitigation plan; engagement with suppliers; escalation to senior management." },
  { n: 4, title: "Carry out independent third-party audit of smelter/refiner", description: "RMAP audit by accredited third-party; audit scope covers all 3TG/cobalt." },
  { n: 5, title: "Report annually on supply-chain due diligence", description: "Public disclosure or regulatory submission; covers OECD DDG alignment and outcomes." },
];

const SMELTERS: Smelter[] = [
  {
    id: "SML-001",
    name: "Rand Refinery Ltd",
    country: "South Africa",
    countryCode: "ZA",
    mineral: "gold",
    rmapStatus: "conformant",
    rmapId: "RMAP-AU-ZA-0014",
    lastAuditDate: "2024-09-10",
    nextAuditDue: "2025-09-10",
    cahraRisk: "medium",
    activeSupplier: true,
    annualVolumeKg: 250,
    flags: [],
    notes: "LBMA Good Delivery. RMAP conformant since 2019. Next audit Sep 2025.",
  },
  {
    id: "SML-002",
    name: "Argor-Heraeus SA",
    country: "Switzerland",
    countryCode: "CH",
    mineral: "gold",
    rmapStatus: "conformant",
    rmapId: "RMAP-AU-CH-0003",
    lastAuditDate: "2025-01-22",
    nextAuditDue: "2026-01-22",
    cahraRisk: "low",
    activeSupplier: true,
    annualVolumeKg: 500,
    flags: [],
    notes: "LBMA Good Delivery. Recycled scrap sourcing. Low CAHRA exposure.",
  },
  {
    id: "SML-003",
    name: "Valcambi SA",
    country: "Switzerland",
    countryCode: "CH",
    mineral: "gold",
    rmapStatus: "conformant",
    rmapId: "RMAP-AU-CH-0007",
    lastAuditDate: "2024-09-05",
    nextAuditDue: "2025-09-05",
    cahraRisk: "low",
    activeSupplier: true,
    annualVolumeKg: 125,
    flags: [],
    notes: "Conformant. European recycled scrap. Next audit due Sep 2025.",
  },
  {
    id: "SML-004",
    name: "PAMP SA",
    country: "Switzerland",
    countryCode: "CH",
    mineral: "gold",
    rmapStatus: "conformant",
    rmapId: "RMAP-AU-CH-0001",
    lastAuditDate: "2025-01-10",
    nextAuditDue: "2026-01-10",
    cahraRisk: "low",
    activeSupplier: true,
    annualVolumeKg: 300,
    flags: [],
    notes: "Conformant. Swiss scrap. Strong audit history.",
  },
  {
    id: "SML-005",
    name: "Unknown DRC Artisanal Smelter",
    country: "Democratic Republic of Congo",
    countryCode: "CD",
    mineral: "gold",
    rmapStatus: "not-enrolled",
    rmapId: "—",
    lastAuditDate: "—",
    nextAuditDue: "—",
    cahraRisk: "high",
    activeSupplier: false,
    flags: ["CAHRA — DRC", "Not enrolled in RMAP", "Potential artisanal origin", "No CDD on broker"],
    notes: "Associated with SHP-2025-0029 (held). Consignment frozen pending STR assessment.",
  },
  {
    id: "SML-006",
    name: "PT Timah Tbk",
    country: "Indonesia",
    countryCode: "ID",
    mineral: "tin",
    rmapStatus: "active",
    rmapId: "RMAP-SN-ID-0009",
    lastAuditDate: "2024-06-15",
    nextAuditDue: "2025-06-15",
    cahraRisk: "medium",
    activeSupplier: false,
    annualVolumeKg: 0,
    flags: [],
    notes: "Audit active. Not a current supplier — watchlist for future sourcing.",
  },
  {
    id: "SML-007",
    name: "Umicore SA",
    country: "Belgium",
    countryCode: "BE",
    mineral: "cobalt",
    rmapStatus: "conformant",
    rmapId: "RMAP-CO-BE-0002",
    lastAuditDate: "2024-11-20",
    nextAuditDue: "2025-11-20",
    cahraRisk: "low",
    activeSupplier: false,
    annualVolumeKg: 0,
    flags: [],
    notes: "Conformant cobalt refiner. No current exposure — noted for ESG completeness.",
  },
];

const AUDIT_LOG: RmapAuditLog[] = [
  { date: "2025-01-22", smelterName: "Argor-Heraeus SA", action: "RMAP audit completed", auditor: "Bureau Veritas", outcome: "Conformant — no findings" },
  { date: "2025-01-10", smelterName: "PAMP SA", action: "RMAP audit completed", auditor: "SGS SA", outcome: "Conformant — 1 observation, corrected" },
  { date: "2024-11-20", smelterName: "Umicore SA", action: "RMAP audit completed", auditor: "Deloitte", outcome: "Conformant — no findings" },
  { date: "2024-09-10", smelterName: "Rand Refinery Ltd", action: "RMAP audit completed", auditor: "PwC", outcome: "Conformant — 2 observations, corrected" },
  { date: "2024-09-05", smelterName: "Valcambi SA", action: "RMAP audit completed", auditor: "Bureau Veritas", outcome: "Conformant — no findings" },
  { date: "2025-04-05", smelterName: "Unknown DRC Smelter", action: "Supplier rejected — CAHRA non-enrollment", auditor: "Hawkeye Compliance", outcome: "Rejected. Consignment SHP-2025-0029 placed on hold." },
];

const RMAP_TONE: Record<RmapStatus, string> = {
  conformant: "bg-green-dim text-green",
  active: "bg-blue-dim text-blue",
  expired: "bg-red-dim text-red",
  "not-enrolled": "bg-red-dim text-red",
  suspended: "bg-amber-dim text-amber",
};

const RMAP_LABEL: Record<RmapStatus, string> = {
  conformant: "Conformant",
  active: "Audit active",
  expired: "Expired",
  "not-enrolled": "Not enrolled",
  suspended: "Suspended",
};

const CAHRA_TONE: Record<CahraRisk, string> = {
  high: "bg-red-dim text-red",
  medium: "bg-amber-dim text-amber",
  low: "bg-green-dim text-green",
};

const MINERAL_LABEL: Record<MineralType, string> = {
  gold: "Gold (Au)",
  tantalum: "Tantalum (Ta)",
  tin: "Tin (Sn)",
  tungsten: "Tungsten (W)",
  cobalt: "Cobalt (Co)",
};

type FilterMineral = MineralType | "all";

const MINERAL_TABS: { key: FilterMineral; label: string }[] = [
  { key: "all", label: "All minerals" },
  { key: "gold", label: "Gold" },
  { key: "tantalum", label: "Tantalum" },
  { key: "tin", label: "Tin" },
  { key: "tungsten", label: "Tungsten" },
  { key: "cobalt", label: "Cobalt" },
];

const RMI_DELETED_KEY = "hawkeye.rmi.deleted.v1";
const RMI_EDITS_KEY = "hawkeye.rmi.edits.v1";

type SmelterEdit = Partial<Pick<Smelter, "name" | "country" | "countryCode" | "mineral" | "rmapStatus" | "rmapId" | "lastAuditDate" | "nextAuditDue" | "cahraRisk" | "activeSupplier" | "annualVolumeKg" | "notes">>;

export default function RmiPage() {
  const [mineralFilter, setMineralFilter] = useState<FilterMineral>("all");
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [rmiAssess, setRmiAssess] = useState<RmiAssessment | null>(null);
  const [rmiAssessLoading, setRmiAssessLoading] = useState(false);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, SmelterEdit>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SmelterEdit>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RMI_DELETED_KEY);
      if (raw) setDeletedIds(JSON.parse(raw) as string[]);
      const editsRaw = localStorage.getItem(RMI_EDITS_KEY);
      if (editsRaw) setEdits(JSON.parse(editsRaw) as Record<string, SmelterEdit>);
    } catch { /* ignore */ }
  }, []);

  const deleteEntry = (id: string) => {
    const next = [...deletedIds, id];
    setDeletedIds(next);
    try { localStorage.setItem(RMI_DELETED_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const restoreAll = () => {
    setDeletedIds([]);
    setEdits({});
    try {
      localStorage.removeItem(RMI_DELETED_KEY);
      localStorage.removeItem(RMI_EDITS_KEY);
    } catch { /* ignore */ }
  };

  const startEdit = (s: Smelter) => {
    setEditingId(s.id);
    const overlay = edits[s.id] ?? {};
    setEditDraft({
      name: overlay.name ?? s.name,
      country: overlay.country ?? s.country,
      countryCode: overlay.countryCode ?? s.countryCode,
      mineral: overlay.mineral ?? s.mineral,
      rmapStatus: overlay.rmapStatus ?? s.rmapStatus,
      rmapId: overlay.rmapId ?? s.rmapId,
      lastAuditDate: overlay.lastAuditDate ?? s.lastAuditDate,
      nextAuditDue: overlay.nextAuditDue ?? s.nextAuditDue,
      cahraRisk: overlay.cahraRisk ?? s.cahraRisk,
      activeSupplier: overlay.activeSupplier ?? s.activeSupplier,
      ...(overlay.annualVolumeKg !== undefined ? { annualVolumeKg: overlay.annualVolumeKg } : (s.annualVolumeKg !== undefined ? { annualVolumeKg: s.annualVolumeKg } : {})),
      notes: overlay.notes ?? s.notes,
    });
  };

  const saveEdit = (id: string) => {
    const next = { ...edits, [id]: { ...edits[id], ...editDraft } };
    setEdits(next);
    try { localStorage.setItem(RMI_EDITS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };

  const liveSmelters = useMemo(
    () => SMELTERS
      .filter((s) => !deletedIds.includes(s.id))
      .map((s) => ({ ...s, ...(edits[s.id] ?? {}) }) as Smelter),
    [deletedIds, edits],
  );
  const visible = mineralFilter === "all" ? liveSmelters : liveSmelters.filter((s) => s.mineral === mineralFilter);

  const runRmiAssessment = async () => {
    setRmiAssessLoading(true);
    try {
      const payload = liveSmelters.map((s) => ({
        name: s.name,
        country: s.country,
        mineral: s.mineral,
        rmapStatus: s.rmapStatus,
        cahraRisk: s.cahraRisk,
        activeSupplier: s.activeSupplier,
        annualVolumeKg: s.annualVolumeKg,
        flags: s.flags,
        lastAuditDate: s.lastAuditDate,
        nextAuditDue: s.nextAuditDue,
        notes: s.notes,
      }));
      const res = await fetch("/api/rmi-assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ smelters: payload }),
      });
      if (res.ok) {
        const data = (await res.json()) as RmiAssessment;
        setRmiAssess(data);
      }
    } catch { /* non-fatal */ } finally {
      setRmiAssessLoading(false);
    }
  };

  const conformant = liveSmelters.filter((s) => s.rmapStatus === "conformant" && s.activeSupplier).length;
  const nonConformant = liveSmelters.filter((s) => s.rmapStatus === "not-enrolled" || s.rmapStatus === "expired" || s.rmapStatus === "suspended").length;
  const cahraHigh = liveSmelters.filter((s) => s.cahraRisk === "high").length;
  const activeSuppliers = liveSmelters.filter((s) => s.activeSupplier).length;

  return (
    <ModuleLayout asanaModule="rmi" asanaLabel="Risk Management Information" engineLabel="Supply-chain compliance engine">
      <ModuleHero
        eyebrow="Module 26 · Supply Chain"
        title="Responsible Minerals Initiative"
        titleEm="RMAP."
        intro={
          <>
            <strong>RMI RMAP · OECD Due Diligence Guidance · UAE DNFBP obligation.</strong>{" "}
            Smelter and refiner audit tracker for 3TG (tantalum, tin, tungsten, gold) and cobalt.
            UAE-based entities sourcing from CAHRAs must maintain RMAP-conformant supply chains.
            Non-conformant suppliers trigger automatic sourcing block and MLRO review.
          </>
        }
        kpis={[
          { value: String(activeSuppliers), label: "active suppliers" },
          { value: String(conformant), label: "RMAP conformant" },
          { value: String(nonConformant), label: "non-conformant", tone: nonConformant > 0 ? "red" : undefined },
          { value: String(cahraHigh), label: "CAHRA high-risk", tone: cahraHigh > 0 ? "red" : undefined },
          { value: String(SMELTERS.length), label: "smelters tracked" },
        ]}
      />

      {/* OECD DDG 5-step alignment summary */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mb-6">
        <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
          OECD Due Diligence Guidance — 5-step framework status
        </div>
        <div className="grid grid-cols-5 gap-2">
          {OECD_STEPS.map((s) => (
            <div key={s.n} className="bg-bg-1 border border-hair-2 rounded p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-5 h-5 rounded bg-green text-white flex items-center justify-center font-mono text-10 font-bold shrink-0">
                  {s.n}
                </div>
                <span className="text-10 font-mono text-green font-semibold uppercase">Complete</span>
              </div>
              <div className="text-11 font-medium text-ink-0 leading-snug">{s.title}</div>
              <div className="text-10 text-ink-3 mt-1 leading-snug">{s.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Supply Chain Assessment button */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={runRmiAssessment}
          disabled={rmiAssessLoading}
          className="px-4 py-2 text-12 font-semibold rounded border border-brand bg-brand-dim text-brand hover:bg-brand hover:text-white transition-colors disabled:opacity-50"
        >
          {rmiAssessLoading ? "Assessing…" : "AI Supply Chain Assessment"}
        </button>
        {rmiAssess && (
          <button
            type="button"
            onClick={() => setRmiAssess(null)}
            className="text-11 text-ink-3 hover:text-ink-1 underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* AI Assessment panel */}
      {rmiAssess && (
        <div className="mb-6 bg-bg-panel border border-hair-2 rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-11 font-semibold uppercase tracking-wide-4 text-ink-2">Portfolio Risk</span>
            <span className={`px-2 py-0.5 rounded font-mono text-11 font-bold uppercase ${
              rmiAssess.portfolioRisk === "critical" || rmiAssess.portfolioRisk === "high"
                ? "bg-red-dim text-red"
                : rmiAssess.portfolioRisk === "medium"
                ? "bg-amber-dim text-amber"
                : "bg-green-dim text-green"
            }`}>
              {rmiAssess.portfolioRisk}
            </span>
          </div>
          <p className="text-13 text-ink-1 leading-relaxed">{rmiAssess.portfolioNarrative}</p>

          {rmiAssess.criticalSmelters.length > 0 && (
            <div>
              <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1.5">Critical Smelters</div>
              <div className="flex flex-wrap gap-1.5">
                {rmiAssess.criticalSmelters.map((name) => (
                  <span key={name} className="px-2 py-0.5 bg-red-dim text-red font-mono text-10 font-semibold rounded-sm">{name}</span>
                ))}
              </div>
            </div>
          )}

          {rmiAssess.oecdGaps.length > 0 && (
            <div>
              <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1.5">OECD DDG Gaps</div>
              <ul className="list-disc list-inside space-y-0.5">
                {rmiAssess.oecdGaps.map((gap) => (
                  <li key={gap} className="text-12 text-ink-1">{gap}</li>
                ))}
              </ul>
            </div>
          )}

          {rmiAssess.cahraExposure && (
            <div>
              <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1">CAHRA Exposure</div>
              <p className="text-12 text-ink-1">{rmiAssess.cahraExposure}</p>
            </div>
          )}

          {rmiAssess.lbmaAlignmentIssues.length > 0 && (
            <div>
              <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1.5">LBMA RGG v9 Issues</div>
              <ul className="list-disc list-inside space-y-0.5">
                {rmiAssess.lbmaAlignmentIssues.map((issue) => (
                  <li key={issue} className="text-12 text-ink-1">{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {rmiAssess.recommendedActions.length > 0 && (
            <div>
              <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1.5">Recommended Actions</div>
              <div className="overflow-x-auto">
                <table className="w-full text-12 border border-hair-2 rounded">
                  <thead className="bg-bg-1">
                    <tr>
                      {["Smelter", "Action", "Urgency", "OECD Step"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rmiAssess.recommendedActions.map((a, i) => (
                      <tr key={i} className={i < rmiAssess.recommendedActions.length - 1 ? "border-b border-hair" : ""}>
                        <td className="px-3 py-2 font-medium text-ink-0">{a.smelter}</td>
                        <td className="px-3 py-2 text-ink-1">{a.action}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-px rounded font-mono text-10 font-semibold uppercase ${
                            a.urgency === "immediate" ? "bg-red-dim text-red"
                            : a.urgency === "3months" ? "bg-amber-dim text-amber"
                            : "bg-green-dim text-green"
                          }`}>{a.urgency}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-10 text-ink-2">Step {a.oecdStep}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {rmiAssess.regulatoryExposure && (
            <div>
              <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1">Regulatory Exposure</div>
              <pre className="text-11 font-mono text-ink-1 bg-bg-1 border border-hair-2 rounded p-2.5 whitespace-pre-wrap leading-relaxed">{rmiAssess.regulatoryExposure}</pre>
            </div>
          )}

          {rmiAssess.auditPriority.length > 0 && (
            <div>
              <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1.5">Audit Priority</div>
              <ol className="list-decimal list-inside space-y-0.5">
                {rmiAssess.auditPriority.map((name) => (
                  <li key={name} className="text-12 text-ink-1">{name}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {deletedIds.length > 0 && (
        <div className="mb-4 px-4 py-2.5 bg-amber-dim border border-amber/20 rounded-lg flex items-center justify-between text-12">
          <span className="text-amber font-semibold">{deletedIds.length} entr{deletedIds.length === 1 ? "y" : "ies"} hidden</span>
          <button type="button" onClick={restoreAll} className="text-11 font-mono underline text-amber hover:text-amber/80">Restore all</button>
        </div>
      )}

      {/* Mineral filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-hair-2">
        {MINERAL_TABS.map((t) => {
          const active = mineralFilter === t.key;
          const count = t.key === "all" ? SMELTERS.length : SMELTERS.filter((s) => s.mineral === t.key).length;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setMineralFilter(t.key)}
              className={`px-3 py-2 text-12 font-medium rounded-t border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? "border-brand text-brand bg-brand-dim"
                  : "border-transparent text-ink-2 hover:text-ink-0 hover:bg-bg-1"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 font-mono text-10 ${active ? "text-brand" : "text-ink-3"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Smelter table */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden mb-6">
        <table className="w-full text-12">
          <thead className="bg-bg-1 border-b border-hair-2">
            <tr>
              {["Smelter / Refiner", "Country", "Mineral", "RMAP ID", "RMAP Status", "CAHRA Risk", "Last Audit", "Next Due", "Active", "Flags", ""].map((h) => (
                <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((s, i) => (
              editingId === s.id ? (
                <tr key={s.id} className={i < visible.length - 1 ? "border-b border-hair bg-bg-1" : "bg-bg-1"}>
                  <td colSpan={11} className="px-3 py-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
                      <label className="text-10 font-mono uppercase tracking-wide-3 text-ink-2">
                        Smelter / Refiner
                        <input
                          type="text"
                          value={editDraft.name ?? ""}
                          onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                          className="block w-full mt-1 px-2 py-1 text-12 bg-bg-0 border border-hair-2 rounded font-sans text-ink-0"
                        />
                      </label>
                      <label className="text-10 font-mono uppercase tracking-wide-3 text-ink-2">
                        Country
                        <input
                          type="text"
                          value={editDraft.country ?? ""}
                          onChange={(e) => setEditDraft((d) => ({ ...d, country: e.target.value }))}
                          className="block w-full mt-1 px-2 py-1 text-12 bg-bg-0 border border-hair-2 rounded font-sans text-ink-0"
                        />
                      </label>
                      <label className="text-10 font-mono uppercase tracking-wide-3 text-ink-2">
                        ISO-2
                        <input
                          type="text"
                          maxLength={2}
                          value={editDraft.countryCode ?? ""}
                          onChange={(e) => setEditDraft((d) => ({ ...d, countryCode: e.target.value.toUpperCase() }))}
                          className="block w-full mt-1 px-2 py-1 text-12 bg-bg-0 border border-hair-2 rounded font-mono uppercase text-ink-0"
                        />
                      </label>
                      <label className="text-10 font-mono uppercase tracking-wide-3 text-ink-2">
                        Mineral
                        <select
                          value={editDraft.mineral ?? "gold"}
                          onChange={(e) => setEditDraft((d) => ({ ...d, mineral: e.target.value as MineralType }))}
                          className="block w-full mt-1 px-2 py-1 text-12 bg-bg-0 border border-hair-2 rounded text-ink-0"
                        >
                          <option value="gold">Gold</option>
                          <option value="tantalum">Tantalum</option>
                          <option value="tin">Tin</option>
                          <option value="tungsten">Tungsten</option>
                          <option value="cobalt">Cobalt</option>
                        </select>
                      </label>
                      <label className="text-10 font-mono uppercase tracking-wide-3 text-ink-2">
                        RMAP ID
                        <input
                          type="text"
                          value={editDraft.rmapId ?? ""}
                          onChange={(e) => setEditDraft((d) => ({ ...d, rmapId: e.target.value }))}
                          className="block w-full mt-1 px-2 py-1 text-12 bg-bg-0 border border-hair-2 rounded font-mono text-ink-0"
                        />
                      </label>
                      <label className="text-10 font-mono uppercase tracking-wide-3 text-ink-2">
                        RMAP Status
                        <select
                          value={editDraft.rmapStatus ?? "conformant"}
                          onChange={(e) => setEditDraft((d) => ({ ...d, rmapStatus: e.target.value as RmapStatus }))}
                          className="block w-full mt-1 px-2 py-1 text-12 bg-bg-0 border border-hair-2 rounded text-ink-0"
                        >
                          <option value="conformant">Conformant</option>
                          <option value="active">Active (in audit)</option>
                          <option value="expired">Expired</option>
                          <option value="not-enrolled">Not enrolled</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </label>
                      <label className="text-10 font-mono uppercase tracking-wide-3 text-ink-2">
                        CAHRA Risk
                        <select
                          value={editDraft.cahraRisk ?? "low"}
                          onChange={(e) => setEditDraft((d) => ({ ...d, cahraRisk: e.target.value as CahraRisk }))}
                          className="block w-full mt-1 px-2 py-1 text-12 bg-bg-0 border border-hair-2 rounded text-ink-0"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </label>
                      <label className="text-10 font-mono uppercase tracking-wide-3 text-ink-2">
                        Last audit
                        <input
                          type="date"
                          value={editDraft.lastAuditDate ?? ""}
                          onChange={(e) => setEditDraft((d) => ({ ...d, lastAuditDate: e.target.value }))}
                          className="block w-full mt-1 px-2 py-1 text-12 bg-bg-0 border border-hair-2 rounded font-mono text-ink-0"
                        />
                      </label>
                      <label className="text-10 font-mono uppercase tracking-wide-3 text-ink-2">
                        Next audit due
                        <input
                          type="date"
                          value={editDraft.nextAuditDue ?? ""}
                          onChange={(e) => setEditDraft((d) => ({ ...d, nextAuditDue: e.target.value }))}
                          className="block w-full mt-1 px-2 py-1 text-12 bg-bg-0 border border-hair-2 rounded font-mono text-ink-0"
                        />
                      </label>
                      <label className="text-10 font-mono uppercase tracking-wide-3 text-ink-2 flex items-center gap-2 mt-5">
                        <input
                          type="checkbox"
                          checked={editDraft.activeSupplier ?? false}
                          onChange={(e) => setEditDraft((d) => ({ ...d, activeSupplier: e.target.checked }))}
                        />
                        Active supplier
                      </label>
                      <label className="text-10 font-mono uppercase tracking-wide-3 text-ink-2">
                        Annual volume (kg)
                        <input
                          type="number"
                          value={editDraft.annualVolumeKg ?? ""}
                          onChange={(e) => setEditDraft((d) => ({
                            ...d,
                            ...(e.target.value === "" ? { annualVolumeKg: undefined } : { annualVolumeKg: Number(e.target.value) }),
                          }))}
                          className="block w-full mt-1 px-2 py-1 text-12 bg-bg-0 border border-hair-2 rounded font-mono text-ink-0"
                        />
                      </label>
                    </div>
                    <label className="text-10 font-mono uppercase tracking-wide-3 text-ink-2 block mb-3">
                      Notes
                      <textarea
                        rows={2}
                        value={editDraft.notes ?? ""}
                        onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                        className="block w-full mt-1 px-2 py-1 text-12 bg-bg-0 border border-hair-2 rounded font-sans text-ink-0"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(s.id)}
                        className="px-3 py-1.5 text-11 font-mono uppercase tracking-wide-3 bg-brand text-white rounded hover:bg-brand/90"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-3 py-1.5 text-11 font-mono uppercase tracking-wide-3 bg-bg-2 text-ink-1 rounded hover:bg-bg-2/70"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={s.id} className={i < visible.length - 1 ? "border-b border-hair" : ""}>
                  <td className="px-3 py-2.5 font-medium text-ink-0">{s.name}</td>
                  <td className="px-3 py-2.5 text-ink-2 whitespace-nowrap">{s.country}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-10 bg-bg-2 text-ink-1 px-1.5 py-px rounded">{MINERAL_LABEL[s.mineral]}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-10 text-ink-3">{s.rmapId}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${RMAP_TONE[s.rmapStatus]}`}>
                      {RMAP_LABEL[s.rmapStatus]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${CAHRA_TONE[s.cahraRisk]}`}>
                      {s.cahraRisk}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-10 text-ink-3 whitespace-nowrap">{s.lastAuditDate}</td>
                  <td className="px-3 py-2.5 font-mono text-10 text-ink-3 whitespace-nowrap">{s.nextAuditDue}</td>
                  <td className="px-3 py-2.5 text-center">
                    {s.activeSupplier
                      ? <span className="text-green font-mono text-11">●</span>
                      : <span className="text-ink-3 font-mono text-11">○</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {s.flags.length > 0 && (
                      <div className="flex flex-col gap-0.5">
                        {s.flags.map((f) => (
                          <span key={f} className="text-10 font-mono bg-red-dim text-red px-1.5 py-px rounded-sm font-semibold whitespace-nowrap">
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <RowActions
                      label={`smelter ${s.id}`}
                      onEdit={() => startEdit(s)}
                      onDelete={() => deleteEntry(s.id)}
                      confirmDelete={false}
                    />
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      {/* RMAP Audit log */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAuditLog((v) => !v)}
          className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-bg-1 transition-colors"
        >
          <span className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2">
            RMAP audit log ({AUDIT_LOG.length} entries)
          </span>
          <span className="text-ink-3 text-12">{showAuditLog ? "▲" : "▾"}</span>
        </button>
        {showAuditLog && (
          <div className="border-t border-hair-2">
            <table className="w-full text-12">
              <thead className="bg-bg-1 border-b border-hair-2">
                <tr>
                  {["Date", "Smelter", "Action", "Auditor", "Outcome"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {AUDIT_LOG.map((e, i) => (
                  <tr key={i} className={i < AUDIT_LOG.length - 1 ? "border-b border-hair" : ""}>
                    <td className="px-3 py-2 font-mono text-10 text-ink-3 whitespace-nowrap">{e.date}</td>
                    <td className="px-3 py-2 font-medium text-ink-0">{e.smelterName}</td>
                    <td className="px-3 py-2 text-ink-1">{e.action}</td>
                    <td className="px-3 py-2 text-ink-2">{e.auditor}</td>
                    <td className="px-3 py-2 text-ink-1">{e.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-10.5 text-ink-3 mt-4 leading-relaxed">
        RMAP (Responsible Minerals Assurance Process) — RMI standard for 3TG and cobalt smelters/refiners.
        UAE DNFBP entities sourcing from CAHRAs must maintain conformant supply chains per OECD DDG and FDL 10/2025.
        Non-conformant suppliers are blocked automatically. Findings escalated to MLRO.
      </p>
    </ModuleLayout>
  );
}
