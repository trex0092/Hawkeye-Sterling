"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

// EOCN — Executive Office for Control & Non-Proliferation (UAE).
// Maintains the UAE consolidated Targeted Financial Sanctions (TFS) list.
// All regulated entities must screen against EOCN list within 24h of update
// and freeze assets / file goAML on any confirmed match.

type ListUpdateStatus = "applied" | "pending" | "failed";
type MatchDisposition = "false-positive" | "confirmed" | "under-review" | "escalated";
type DeclarationStatus = "filed" | "overdue" | "in-progress" | "not-due";

interface ListUpdate {
  id: string;
  date: string;
  time: string;
  version: string;
  deltaAdded: number;
  deltaRemoved: number;
  screeningStatus: ListUpdateStatus;
  screeningCompletedAt?: string;
  notes: string;
}

interface EocnMatch {
  id: string;
  screenedAt: string;
  subject: string;
  matchScore: number;
  listEntry: string;
  listVersion: string;
  disposition: MatchDisposition;
  dispositionDate?: string;
  goAmlRef?: string;
  mlroSignedOff: boolean;
  notes: string;
}

interface AnnualDeclaration {
  year: number;
  status: DeclarationStatus;
  filedDate?: string;
  refNumber?: string;
  period: string;
  notes: string;
}

const LIST_UPDATES: ListUpdate[] = [
  {
    id: "LU-2025-0041",
    date: "2025-04-22",
    time: "08:15",
    version: "EOCN-TFS-v2025.041",
    deltaAdded: 3,
    deltaRemoved: 1,
    screeningStatus: "applied",
    screeningCompletedAt: "2025-04-22 09:47",
    notes: "3 new designations; 1 delisting. Full re-screen completed within SLA (24h).",
  },
  {
    id: "LU-2025-0038",
    date: "2025-04-15",
    time: "10:30",
    version: "EOCN-TFS-v2025.038",
    deltaAdded: 0,
    deltaRemoved: 2,
    screeningStatus: "applied",
    screeningCompletedAt: "2025-04-15 11:15",
    notes: "2 delistings only. Rapid re-screen completed within 45 minutes.",
  },
  {
    id: "LU-2025-0035",
    date: "2025-04-08",
    time: "14:00",
    version: "EOCN-TFS-v2025.035",
    deltaAdded: 7,
    deltaRemoved: 0,
    screeningStatus: "applied",
    screeningCompletedAt: "2025-04-08 20:30",
    notes: "7 new designations including 2 UAE-nexus entities. Re-screen flagged 1 potential match (see EOCN-MATCH-0012).",
  },
  {
    id: "LU-2025-0031",
    date: "2025-04-01",
    time: "09:00",
    version: "EOCN-TFS-v2025.031",
    deltaAdded: 1,
    deltaRemoved: 0,
    screeningStatus: "applied",
    screeningCompletedAt: "2025-04-01 14:22",
    notes: "1 new designation. No customer matches.",
  },
  {
    id: "LU-2025-0028",
    date: "2025-03-25",
    time: "11:45",
    version: "EOCN-TFS-v2025.028",
    deltaAdded: 0,
    deltaRemoved: 0,
    screeningStatus: "applied",
    screeningCompletedAt: "2025-03-25 12:10",
    notes: "Administrative update — no new designations.",
  },
];

const MATCHES: EocnMatch[] = [
  {
    id: "EOCN-MATCH-0012",
    screenedAt: "2025-04-08 21:00",
    subject: "Al-Noor Trading LLC",
    matchScore: 91,
    listEntry: "Al Noor General Trading Co — UAE designation 2025-04-08",
    listVersion: "EOCN-TFS-v2025.035",
    disposition: "under-review",
    mlroSignedOff: false,
    notes: "91% fuzzy match on name. Corporate structure check in progress. 24h MLRO review window active.",
  },
  {
    id: "EOCN-MATCH-0009",
    screenedAt: "2025-03-12 14:30",
    subject: "Gulf Gem Jewellers",
    matchScore: 87,
    listEntry: "Gulf Gem Exchange — UNSC 1267 designee",
    listVersion: "EOCN-TFS-v2025.019",
    disposition: "false-positive",
    dispositionDate: "2025-03-13 09:15",
    mlroSignedOff: true,
    notes: "Different entity — different trade licence, directors, address. MLRO confirmed false positive. Documented.",
  },
  {
    id: "EOCN-MATCH-0007",
    screenedAt: "2025-02-20 10:00",
    subject: "Tariq Al-Rashidi",
    matchScore: 96,
    listEntry: "Tariq Mohammed Al-Rashidi — MoE TFS designation",
    listVersion: "EOCN-TFS-v2025.011",
    disposition: "confirmed",
    dispositionDate: "2025-02-20 11:30",
    goAmlRef: "goAML-STR-2025-0033",
    mlroSignedOff: true,
    notes: "Confirmed match — same DoB, Emirates ID fragment. Assets frozen. goAML FFR filed within 5 business days. MoE notified.",
  },
  {
    id: "EOCN-MATCH-0005",
    screenedAt: "2025-01-15 09:20",
    subject: "Crescent Bullion FZC",
    matchScore: 88,
    listEntry: "Crescent Metals & Bullion Co — EU FSF designation",
    listVersion: "EOCN-TFS-v2025.004",
    disposition: "escalated",
    dispositionDate: "2025-01-15 16:00",
    mlroSignedOff: false,
    notes: "Match under Board review — entity has UAE trade licence but listed by EU. Pending MoE guidance.",
  },
];

const DECLARATIONS: AnnualDeclaration[] = [
  {
    year: 2024,
    status: "filed",
    filedDate: "2025-02-15",
    refNumber: "EOCN-DEC-2024-00441",
    period: "01/01/2024 – 31/12/2024",
    notes: "Filed on time. Covers all upstream smelters and refiners. LBMA / RJC CoC certificates attached.",
  },
  {
    year: 2023,
    status: "filed",
    filedDate: "2024-03-10",
    refNumber: "EOCN-DEC-2023-00291",
    period: "01/01/2023 – 31/12/2023",
    notes: "Filed. One late observation from EOCN acknowledged.",
  },
  {
    year: 2025,
    status: "in-progress",
    period: "01/01/2025 – 31/12/2025",
    notes: "Data collection in progress. Declaration due 31 March 2026.",
  },
];

const UPDATE_STATUS_TONE: Record<ListUpdateStatus, string> = {
  applied: "bg-green-dim text-green",
  pending: "bg-amber-dim text-amber",
  failed: "bg-red-dim text-red",
};

const DISPOSITION_TONE: Record<MatchDisposition, string> = {
  "false-positive": "bg-bg-2 text-ink-2",
  confirmed: "bg-red-dim text-red",
  "under-review": "bg-amber-dim text-amber",
  escalated: "bg-violet-dim text-violet",
};

const DISPOSITION_LABEL: Record<MatchDisposition, string> = {
  "false-positive": "False positive",
  confirmed: "Confirmed match",
  "under-review": "Under review",
  escalated: "Escalated",
};

const DECL_TONE: Record<DeclarationStatus, string> = {
  filed: "bg-green-dim text-green",
  overdue: "bg-red-dim text-red",
  "in-progress": "bg-amber-dim text-amber",
  "not-due": "bg-bg-2 text-ink-2",
};

type Tab = "list-updates" | "matches" | "declarations";

const EOCN_DELETED_KEY = "hawkeye.eocn.matches.deleted.v1";

export default function EocnPage() {
  const [tab, setTab] = useState<Tab>("list-updates");
  const [deletedMatchIds, setDeletedMatchIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setLastRefreshed(new Date());
    }, 900);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EOCN_DELETED_KEY);
      if (raw) setDeletedMatchIds(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
  }, []);

  const deleteMatch = (id: string) => {
    const next = [...deletedMatchIds, id];
    setDeletedMatchIds(next);
    try { localStorage.setItem(EOCN_DELETED_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const restoreMatches = () => {
    setDeletedMatchIds([]);
    try { localStorage.removeItem(EOCN_DELETED_KEY); } catch { /* ignore */ }
  };

  const liveMatches = useMemo(() => MATCHES.filter((m) => !deletedMatchIds.includes(m.id)), [deletedMatchIds]);

  const pendingScreening = LIST_UPDATES.filter((u) => u.screeningStatus === "pending").length;
  const openMatches = liveMatches.filter((m) => m.disposition === "under-review" || m.disposition === "escalated").length;
  const confirmedMatches = liveMatches.filter((m) => m.disposition === "confirmed").length;
  const overdue = DECLARATIONS.filter((d) => d.status === "overdue").length;
  const lastUpdate = LIST_UPDATES[0];

  return (
    <ModuleLayout asanaModule="eocn" asanaLabel="EOCN Trade Compliance" engineLabel="EOCN sanctions engine">
      <ModuleHero
        eyebrow="Module 27 · Sanctions"
        title="EOCN targeted financial"
        titleEm="sanctions."
        intro={
          <>
            <strong>Executive Office for Control & Non-Proliferation — UAE consolidated TFS list.</strong>{" "}
            All regulated entities must screen against the EOCN list within 24 hours of each update.
            Asset freeze and goAML filing are mandatory on confirmed match. Annual responsible-sourcing
            declaration covers all upstream smelters and refiners with LBMA / RJC chain-of-custody certificates.
          </>
        }
        kpis={[
          { value: lastUpdate ? lastUpdate.version.split("v")[1] ?? "—" : "—", label: "list version" },
          { value: String(pendingScreening), label: "re-screens pending", tone: pendingScreening > 0 ? "amber" : undefined },
          { value: String(openMatches), label: "open matches", tone: openMatches > 0 ? "red" : undefined },
          { value: String(confirmedMatches), label: "confirmed matches", tone: confirmedMatches > 0 ? "red" : undefined },
          { value: String(overdue), label: "declarations overdue", tone: overdue > 0 ? "red" : undefined },
        ]}
      />

      {/* Tabs */}
      <div className="flex items-end gap-1 mb-6 border-b border-hair-2">
        {([
          { key: "list-updates" as Tab, label: "List updates" },
          { key: "matches" as Tab, label: "Matches & dispositions" },
          { key: "declarations" as Tab, label: "Annual declarations" },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-12 font-medium rounded-t border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? "border-brand text-brand bg-brand-dim"
                : "border-transparent text-ink-2 hover:text-ink-0 hover:bg-bg-1"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-2 pb-2">
          {lastRefreshed && (
            <span className="text-10 font-mono text-ink-3">
              Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1 rounded border border-hair-2 text-11 font-medium text-ink-2 bg-bg-1 hover:bg-bg-2 hover:text-ink-0 transition-colors disabled:opacity-50"
          >
            <svg
              className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13.5 8A5.5 5.5 0 1 1 10 3.07" />
              <path d="M10 1v3h3" />
            </svg>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* LIST UPDATES TAB */}
      {tab === "list-updates" && (
        <div className="flex flex-col gap-3">
          {/* SLA reminder */}
          <div className="bg-blue-dim border border-blue/20 rounded-lg px-4 py-2.5 flex items-center gap-3">
            <span className="text-blue font-mono text-10 font-semibold uppercase">SLA</span>
            <span className="text-12 text-ink-1">
              Full customer re-screen must complete within <strong>24 hours</strong> of each EOCN list update.
              Failed or pending re-screens escalate automatically to MLRO.
            </span>
          </div>

          <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
            <table className="w-full text-12">
              <thead className="bg-bg-1 border-b border-hair-2">
                <tr>
                  {["Version", "Date / Time", "Added", "Removed", "Screening status", "Completed at", "Notes"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LIST_UPDATES.map((u, i) => (
                  <tr key={u.id} className={i < LIST_UPDATES.length - 1 ? "border-b border-hair" : ""}>
                    <td className="px-3 py-2.5 font-mono text-10 text-ink-0">{u.version}</td>
                    <td className="px-3 py-2.5 font-mono text-10 text-ink-2 whitespace-nowrap">{u.date} {u.time}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-11">
                      {u.deltaAdded > 0 ? <span className="text-red font-semibold">+{u.deltaAdded}</span> : <span className="text-ink-3">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-11">
                      {u.deltaRemoved > 0 ? <span className="text-green font-semibold">-{u.deltaRemoved}</span> : <span className="text-ink-3">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold uppercase ${UPDATE_STATUS_TONE[u.screeningStatus]}`}>
                        {u.screeningStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-10 text-ink-3 whitespace-nowrap">{u.screeningCompletedAt ?? "—"}</td>
                    <td className="px-3 py-2.5 text-11 text-ink-2 max-w-[220px] truncate" title={u.notes}>{u.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MATCHES TAB */}
      {tab === "matches" && (
        <div className="flex flex-col gap-4">
          {openMatches > 0 && (
            <div className="bg-red-dim border border-red/20 rounded-lg px-4 py-2.5 flex items-center gap-3">
              <span className="text-red font-mono text-10 font-semibold uppercase">Action required</span>
              <span className="text-12 text-ink-1">
                {openMatches} match{openMatches !== 1 ? "es" : ""} require MLRO disposition within 24h of detection.
              </span>
            </div>
          )}

          {deletedMatchIds.length > 0 && (
            <div className="px-4 py-2.5 bg-amber-dim border border-amber/20 rounded-lg flex items-center justify-between text-12">
              <span className="text-amber font-semibold">{deletedMatchIds.length} match{deletedMatchIds.length === 1 ? "" : "es"} hidden</span>
              <button type="button" onClick={restoreMatches} className="text-11 font-mono underline text-amber hover:text-amber/80">Restore all</button>
            </div>
          )}

          {liveMatches.map((m) => (
            <div key={m.id} className="relative bg-bg-panel border border-hair-2 rounded-lg p-4">
              <button
                type="button"
                onClick={() => deleteMatch(m.id)}
                className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-ink-3 hover:text-red hover:bg-red-dim transition-colors text-14 font-light"
                title="Dismiss"
              >
                ×
              </button>
              <div className="flex items-start justify-between gap-3 mb-3 pr-6">
                <div>
                  <div className="font-mono text-10 text-ink-3">{m.id}</div>
                  <div className="text-14 font-semibold text-ink-0 mt-0.5">{m.subject}</div>
                  <div className="text-11 text-ink-2 mt-0.5">
                    Screened {m.screenedAt} · List version {m.listVersion}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase ${DISPOSITION_TONE[m.disposition]}`}>
                    {DISPOSITION_LABEL[m.disposition]}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-10 text-ink-3">Match score</span>
                    <span className={`font-mono text-13 font-bold ${m.matchScore >= 95 ? "text-red" : m.matchScore >= 85 ? "text-amber" : "text-ink-0"}`}>
                      {m.matchScore}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-bg-1 rounded p-2.5 mb-3 text-12">
                <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">List entry</div>
                <div className="text-ink-0">{m.listEntry}</div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3 text-12">
                <div className="bg-bg-1 rounded p-2">
                  <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">MLRO sign-off</div>
                  <div className={m.mlroSignedOff ? "text-green font-semibold" : "text-amber font-semibold"}>
                    {m.mlroSignedOff ? "✓ Signed off" : "Pending"}
                  </div>
                </div>
                <div className="bg-bg-1 rounded p-2">
                  <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">Disposition date</div>
                  <div className="font-mono text-10 text-ink-1">{m.dispositionDate ?? "—"}</div>
                </div>
                <div className="bg-bg-1 rounded p-2">
                  <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">goAML ref</div>
                  <div className="font-mono text-10 text-ink-1">{m.goAmlRef ?? "—"}</div>
                </div>
              </div>

              <div className="text-12 text-ink-2 border-l-2 border-hair-2 pl-3">
                {m.notes}
              </div>

              {(m.disposition === "under-review") && (
                <div className="mt-3 flex gap-2">
                  <button type="button" className="text-11 font-semibold px-3 py-1.5 rounded bg-red text-white hover:bg-red/90">
                    Confirm match — freeze & file goAML
                  </button>
                  <button type="button" className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2">
                    Confirm false positive
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* DECLARATIONS TAB */}
      {tab === "declarations" && (
        <div className="flex flex-col gap-4">
          <div className="bg-bg-1 border border-hair-2 rounded-lg px-4 py-3 text-12 text-ink-1">
            <strong>EOCN Annual Responsible-Sourcing Declaration</strong> — Required by 31 March each year.
            Must cover all upstream smelters and refiners. Declaration must be supported by LBMA / RJC
            Chain-of-Custody certificates. Failure to file is a reportable compliance breach.
          </div>

          {DECLARATIONS.sort((a, b) => b.year - a.year).map((d) => (
            <div key={d.year} className="bg-bg-panel border border-hair-2 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-14 font-semibold text-ink-0">
                    {d.year} Responsible-Sourcing Declaration
                  </div>
                  <div className="text-11 text-ink-2 mt-0.5">Period: {d.period}</div>
                </div>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase ${DECL_TONE[d.status]}`}>
                  {d.status === "in-progress" ? "In progress" : d.status}
                </span>
              </div>

              {(d.filedDate || d.refNumber) && (
                <div className="mt-3 grid grid-cols-2 gap-3 text-12">
                  {d.filedDate && (
                    <div className="bg-bg-1 rounded p-2">
                      <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">Filed date</div>
                      <div className="font-mono text-10 text-ink-0">{d.filedDate}</div>
                    </div>
                  )}
                  {d.refNumber && (
                    <div className="bg-bg-1 rounded p-2">
                      <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">Reference</div>
                      <div className="font-mono text-10 text-ink-0">{d.refNumber}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 text-12 text-ink-2 border-l-2 border-hair-2 pl-3">{d.notes}</div>

              {d.status === "in-progress" && (
                <button type="button" className="mt-3 text-11 font-semibold px-3 py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1">
                  Upload declaration
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </ModuleLayout>
  );
}
