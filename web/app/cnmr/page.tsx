"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { IsoDateInput } from "@/components/ui/IsoDateInput";
import type { CnmrCase } from "@/app/api/cnmr/route";

// CNMR — Confirmed Name Match Report
// When a screening hit against the UAE Local Terrorist List or UN Consolidated
// List is resolved as "positive", UAE law (CD74/2020 Art.21 + EOCN guidance)
// requires a CNMR to be filed via goAML to EOCN and MoE within 5 business days
// of the freezing measure. This module manages that workflow.

const STORAGE_KEY = "hawkeye.cnmr.local.v1";

const STATUS_TONE: Record<CnmrCase["status"], string> = {
  pending: "bg-amber-dim text-amber border border-amber/30",
  drafted: "bg-blue-dim text-blue border border-blue/30",
  filed: "bg-green-dim text-green border border-green/30",
  overdue: "bg-red-dim text-red border border-red/30",
};

const STATUS_LABEL: Record<CnmrCase["status"], string> = {
  pending: "Pending",
  drafted: "Draft ready",
  filed: "Filed",
  overdue: "OVERDUE",
};

const LIST_LABEL: Record<CnmrCase["sourceList"], string> = {
  "uae-local-terrorist": "UAE Local Terrorist List",
  "un-consolidated": "UN Consolidated List",
  "un-1267": "UNSC 1267 Committee",
  "un-1988": "UNSC 1988 Committee",
};

function businessDaysRemaining(deadline: string): number {
  const now = new Date();
  const dl = new Date(deadline);
  if (dl <= now) return 0;
  let count = 0;
  const d = new Date(now);
  while (d < dl) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function SlaBar({ deadline, status }: { deadline: string; status: CnmrCase["status"] }) {
  const remaining = businessDaysRemaining(deadline);
  const pct = Math.max(0, Math.min(100, (remaining / 5) * 100));
  const color = status === "overdue" || remaining === 0 ? "bg-red" : remaining <= 1 ? "bg-amber" : "bg-green";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-bg-2 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-mono text-10 font-semibold ${status === "overdue" ? "text-red" : remaining <= 1 ? "text-amber" : "text-green"}`}>
        {status === "overdue" ? "OVERDUE" : status === "filed" ? "FILED" : `${remaining}bd`}
      </span>
    </div>
  );
}

interface NewCnmrFormProps { onCreated: (c: CnmrCase) => void; onCancel: () => void; }
function NewCnmrForm({ onCreated, onCancel }: NewCnmrFormProps) {
  const [subjectName, setSubjectName] = useState("");
  const [sourceList, setSourceList] = useState<CnmrCase["sourceList"]>("uae-local-terrorist");
  const [listEntry, setListEntry] = useState("");
  const [matchScore, setMatchScore] = useState("100");
  const [freezeDate, setFreezeDate] = useState(new Date().toISOString().slice(0, 10));
  const [narrativeDraft, setNarrativeDraft] = useState("");
  const [supervisoryAuthority, setSupervisoryAuthority] = useState<CnmrCase["supervisoryAuthority"]>("both");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const submit = async () => {
    if (!subjectName.trim()) { setError("Subject name required"); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/cnmr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectName, sourceList, listEntry, matchScore: parseInt(matchScore) || 100, freezeDate: new Date(freezeDate).toISOString(), narrativeDraft, supervisoryAuthority }),
      });
      const data = (await res.json()) as { ok: boolean; case?: CnmrCase; error?: string };
      if (!mountedRef.current) return;
      if (!data.ok) { setError(data.error ?? "Failed to create case"); return; }
      onCreated(data.case!);
    } catch { if (mountedRef.current) setError("Network error"); }
    finally { if (mountedRef.current) setSaving(false); }
  };

  const inputCls = "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:border-brand outline-none";

  return (
    <div className="bg-bg-panel border border-brand/30 rounded-xl p-5">
      <div className="text-10 font-mono uppercase tracking-wide-3 text-brand mb-1">New CNMR case</div>
      <div className="text-14 font-semibold text-ink-0 mb-4">Confirmed Name Match — goAML CNMR Filing</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Subject name *</label>
          <input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} className={inputCls} placeholder="Full name as matched" /></div>
        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Source list *</label>
          <select value={sourceList} onChange={(e) => setSourceList(e.target.value as CnmrCase["sourceList"])} className={inputCls}>
            {(Object.entries(LIST_LABEL) as [CnmrCase["sourceList"], string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">List entry (ref)</label>
          <input value={listEntry} onChange={(e) => setListEntry(e.target.value)} className={inputCls} placeholder="e.g. QDe.011 / QDi.123" /></div>
        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Match score (%)</label>
          <input type="number" min={0} max={100} value={matchScore} onChange={(e) => setMatchScore(e.target.value)} className={inputCls} /></div>
        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Freeze date</label>
          <IsoDateInput value={freezeDate} onChange={(iso) => setFreezeDate(iso)} className={inputCls} /></div>
        <div><label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Supervisory authority</label>
          <select value={supervisoryAuthority} onChange={(e) => setSupervisoryAuthority(e.target.value as CnmrCase["supervisoryAuthority"])} className={inputCls}>
            <option value="both">EOCN + MoE (both)</option>
            <option value="eocn">EOCN only</option>
            <option value="moe">MoE only</option>
          </select></div>
      </div>
      <div className="mt-3">
        <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Narrative draft (for goAML filing)</label>
        <textarea value={narrativeDraft} onChange={(e) => setNarrativeDraft(e.target.value)} rows={4} className={`${inputCls} resize-y`}
          placeholder="Describe the confirmed match: subject identity, list entry reference, screening date, freeze action taken, account / asset details…" />
      </div>
      {error && <p className="text-11 text-red mt-2">{error}</p>}
      <div className="flex items-center gap-3 mt-4">
        <button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded bg-red text-white text-12 font-semibold hover:bg-red/90 disabled:opacity-50">
          {saving ? "Creating…" : "Create CNMR case"}
        </button>
        <button type="button" onClick={onCancel} className="text-12 text-ink-2 hover:text-ink-0 px-3 py-2">Cancel</button>
      </div>
      <p className="text-10 text-ink-3 mt-3">CD74/2020 Art.21 · EOCN guidance · 5 business-day deadline from freeze date. Filing via goAML — CNMR report code.</p>
    </div>
  );
}

interface CaseDetailProps { c: CnmrCase; onUpdate: (c: CnmrCase) => void; }
function CaseDetail({ c, onUpdate }: CaseDetailProps) {
  const [narrativeDraft, setNarrativeDraft] = useState(c.narrativeDraft);
  const [goAmlRef, setGoAmlRef] = useState(c.goAmlRef ?? "");
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const patch = async (patch: Partial<CnmrCase>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/cnmr", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: c.id, ...patch }) });
      const data = (await res.json()) as { ok: boolean; case?: CnmrCase };
      if (!mountedRef.current) return;
      if (data.ok && data.case) onUpdate(data.case);
    } finally { if (mountedRef.current) setSaving(false); }
  };

  const inputCls = "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-1 text-ink-0 focus:border-brand outline-none";

  return (
    <div className="space-y-4 px-4 pb-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-11">
        {[
          { label: "Source list", val: LIST_LABEL[c.sourceList] },
          { label: "List entry", val: c.listEntry || "—" },
          { label: "Match score", val: `${c.matchScore}%` },
          { label: "Supervisory authority", val: c.supervisoryAuthority === "both" ? "EOCN + MoE" : c.supervisoryAuthority.toUpperCase() },
          { label: "Freeze date", val: c.freezeDate ? new Date(c.freezeDate).toLocaleDateString("en-GB") : "—" },
          { label: "Filing deadline", val: c.deadlineDate ? new Date(c.deadlineDate).toLocaleDateString("en-GB") : "—" },
          { label: "MLRO sign-off", val: c.mlroSignedOff ? `✓ ${c.mlroSignedOffAt ? new Date(c.mlroSignedOffAt).toLocaleDateString("en-GB") : ""}` : "Pending" },
          { label: "Filed at", val: c.filedAt ? new Date(c.filedAt).toLocaleDateString("en-GB") : "—" },
        ].map(({ label, val }) => (
          <div key={label} className="bg-bg-1 rounded p-2">
            <div className="text-9 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">{label}</div>
            <div className="text-12 text-ink-0 font-medium">{val}</div>
          </div>
        ))}
      </div>

      <div>
        <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">goAML reference number</label>
        <div className="flex gap-2">
          <input value={goAmlRef} onChange={(e) => setGoAmlRef(e.target.value)} className={inputCls} placeholder="Reference assigned after goAML submission" />
          <button type="button" onClick={() => void patch({ goAmlRef })} disabled={saving || goAmlRef === c.goAmlRef}
            className="px-3 py-1.5 rounded border border-hair-2 text-12 text-ink-1 hover:bg-bg-2 disabled:opacity-40 whitespace-nowrap">Save</button>
        </div>
      </div>

      <div>
        <label className="block text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">Narrative draft for goAML filing</label>
        <textarea value={narrativeDraft} onChange={(e) => setNarrativeDraft(e.target.value)} rows={5} className={`${inputCls} resize-y`}
          placeholder="Describe the confirmed match for the goAML CNMR report narrative…" />
        <button type="button" onClick={() => void patch({ narrativeDraft, status: "drafted" as const })} disabled={saving}
          className="mt-2 text-11 px-3 py-1.5 rounded border border-brand/40 text-brand hover:bg-brand-dim font-semibold">Save narrative</button>
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-hair">
        {!c.mlroSignedOff && (
          <button type="button" onClick={() => void patch({ mlroSignedOff: true })} disabled={saving}
            className="text-11 font-semibold px-3 py-1.5 rounded border border-green/40 text-green bg-green-dim hover:bg-green/20">
            ✓ MLRO sign-off
          </button>
        )}
        {c.status !== "filed" && (
          <button type="button" onClick={() => void patch({ status: "filed" as const, goAmlRef })} disabled={saving || !c.mlroSignedOff}
            title={!c.mlroSignedOff ? "MLRO sign-off required before filing" : "Mark as filed in goAML"}
            className="text-11 font-semibold px-3 py-1.5 rounded border border-amber/40 text-amber bg-amber-dim hover:bg-amber/20 disabled:opacity-40">
            Mark as filed in goAML
          </button>
        )}
        <a href="/goaml-export" className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2 no-underline">
          Open goAML Export ↗
        </a>
      </div>
    </div>
  );
}

export default function CnmrPage() {
  const [cases, setCases] = useState<CnmrCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadCases = useCallback(async () => {
    try {
      const res = await fetch("/api/cnmr");
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; cases: CnmrCase[] };
        if (!mountedRef.current) return;
        if (data.ok) setCases(data.cases);
      }
    } catch { /* use localStorage fallback */ }
    finally { if (mountedRef.current) setLoading(false); }
  }, []);

  useEffect(() => { void loadCases(); }, [loadCases]);

  const handleCreated = (c: CnmrCase) => {
    setCases((prev) => [c, ...prev]);
    setShowNew(false);
    setExpandedId(c.id);
  };

  const handleUpdate = (updated: CnmrCase) => {
    setCases((prev) => prev.map((c) => c.id === updated.id ? updated : c));
  };

  const pending = cases.filter((c) => c.status === "pending" || c.status === "drafted").length;
  const overdue = cases.filter((c) => c.status === "overdue").length;
  const filed = cases.filter((c) => c.status === "filed").length;

  return (
    <ModuleLayout asanaModule="cnmr" asanaLabel="CNMR Workflow" engineLabel="CNMR compliance engine">
      <ModuleHero
        moduleNumber={51}
        eyebrow="Module 51 · Sanctions Compliance"
        title="CNMR — Confirmed Name Match"
        titleEm="report."
        kpis={[
          { value: String(pending), label: "pending filings", tone: pending > 0 ? "amber" : undefined },
          { value: String(overdue), label: "overdue", tone: overdue > 0 ? "red" : undefined },
          { value: String(filed), label: "filed" },
          { value: "5bd", label: "SLA from freeze" },
        ]}
        intro={
          <>
            <strong>CD74/2020 Art.21 · EOCN guidance.</strong>{" "}
            When the screening engine returns a CONFIRMED match against the UAE Local Terrorist List or
            UN Consolidated List, a Confirmed Name Match Report (CNMR) must be filed via goAML to EOCN
            and the supervising authority (MoE for DPMS) within <strong>5 business days</strong> of the
            freezing measure. This workflow is separate from the STR/SAR flow.
          </>
        }
      />

      {/* Regulatory callout */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-red-dim border border-red/20 rounded-lg px-4 py-3">
          <div className="text-10 font-mono uppercase tracking-wide-3 text-red font-semibold mb-1">Legal basis</div>
          <div className="text-12 text-ink-1">CD74/2020 Art.21 — Designated persons: freeze assets immediately, file CNMR within 5 business days via goAML to EOCN + MoE.</div>
        </div>
        <div className="bg-amber-dim border border-amber/20 rounded-lg px-4 py-3">
          <div className="text-10 font-mono uppercase tracking-wide-3 text-amber font-semibold mb-1">Trigger</div>
          <div className="text-12 text-ink-1">CONFIRMED match on: UAE Local Terrorist List · UN Consolidated List · UNSC 1267 · UNSC 1988. Match score ≥ 90% + MLRO confirmation = confirmed match.</div>
        </div>
        <div className="bg-blue-dim border border-blue/20 rounded-lg px-4 py-3">
          <div className="text-10 font-mono uppercase tracking-wide-3 text-blue font-semibold mb-1">Tipping-off prohibition</div>
          <div className="text-12 text-ink-1">P4 prohibition applies. Do NOT inform the subject of the freeze or CNMR filing. FDL Art.25.</div>
        </div>
      </div>

      {/* New case button */}
      {!showNew && (
        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-red text-white text-12 font-semibold hover:bg-red/90">
            + New CNMR case
          </button>
          <span className="text-11 text-ink-3">Triggered automatically when a screening hit is resolved "Positive" on a TFS list — or enter manually.</span>
        </div>
      )}

      {showNew && <div className="mb-6"><NewCnmrForm onCreated={handleCreated} onCancel={() => setShowNew(false)} /></div>}

      {/* Cases table */}
      {loading ? (
        <div className="py-12 text-center text-11 text-ink-3">Loading CNMR cases…</div>
      ) : cases.length === 0 ? (
        <div className="py-16 text-center">
          <div className="text-32 mb-3">✓</div>
          <div className="text-14 font-semibold text-ink-0 mb-1">No CNMR cases</div>
          <p className="text-12 text-ink-2">No confirmed TFS list matches requiring CNMR filing. Cases are created when a screening hit is resolved as "Positive" against the UAE Local Terrorist List or UN Consolidated List.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => {
            const expanded = expandedId === c.id;
            return (
              <div key={c.id} className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
                <div
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bg-2 transition-colors ${expanded ? "bg-bg-2 border-b border-hair" : ""}`}
                  onClick={() => setExpandedId(expanded ? null : c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedId(expanded ? null : c.id); }}
                >
                  <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase ${STATUS_TONE[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-13 font-semibold text-ink-0 truncate">{c.subjectName}</div>
                    <div className="text-10 text-ink-3 font-mono">{LIST_LABEL[c.sourceList]} · Match {c.matchScore}%</div>
                  </div>
                  <div className="w-36 shrink-0">
                    <SlaBar deadline={c.deadlineDate} status={c.status} />
                  </div>
                  <div className="text-10 text-ink-3 font-mono shrink-0 hidden md:block">
                    {new Date(c.createdAt).toLocaleDateString("en-GB")}
                  </div>
                  <span className="text-ink-3 font-mono text-12">{expanded ? "▾" : "▸"}</span>
                </div>
                {expanded && <CaseDetail c={c} onUpdate={handleUpdate} />}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-10.5 text-ink-3 mt-6 leading-relaxed">
        CNMR filing is mandatory under CD74/2020 and is distinct from STR/SAR reporting. Freeze assets on confirmed match.
        File CNMR within 5 business days. The tipping-off prohibition (FDL Art.25) applies — do not notify the subject.
        Maintain records for a minimum of 5 years per CR74/2020 Art.7.
      </p>
    </ModuleLayout>
  );
}
