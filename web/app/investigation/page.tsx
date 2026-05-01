"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { loadCases } from "@/lib/data/case-store";
import type { CaseRecord } from "@/lib/types";

type PartyKind = "ubo" | "director" | "counterparty" | "nominee" | "agent" | "vehicle";
type EventKind =
  | "edd_raised" | "str_filed" | "case_opened" | "screening_hit"
  | "sanctions_match" | "pep_match" | "interview" | "document_request" | "other";

interface RelatedParty {
  id: string;
  name: string;
  kind: PartyKind;
  relationship: string;
}

interface TimelineEvent {
  id: string;
  date: string;
  kind: EventKind;
  description: string;
}

interface BrainAnalysis {
  narrative: string;
  typologies: string[];
  keyRelationships: string[];
  nextSteps: string[];
  riskLevel: "critical" | "high" | "medium" | "low";
}

const PARTY_LABEL: Record<PartyKind, string> = {
  ubo: "UBO", director: "Director", counterparty: "Counterparty",
  nominee: "Nominee", agent: "Agent", vehicle: "Vehicle",
};

const PARTY_ICON: Record<PartyKind, string> = {
  ubo: "●", director: "▲", counterparty: "■", nominee: "◆", agent: "▼", vehicle: "○",
};

const PARTY_COLOR: Record<PartyKind, { stroke: string; fill: string; text: string }> = {
  ubo:          { stroke: "#a78bfa", fill: "#1e1530", text: "#ede9fe" },
  director:     { stroke: "#60a5fa", fill: "#0f1e30", text: "#dbeafe" },
  counterparty: { stroke: "#34d399", fill: "#021f14", text: "#d1fae5" },
  nominee:      { stroke: "#fbbf24", fill: "#1f1800", text: "#fef3c7" },
  agent:        { stroke: "#f87171", fill: "#1f0a0a", text: "#fee2e2" },
  vehicle:      { stroke: "#94a3b8", fill: "#0f172a", text: "#e2e8f0" },
};

const EVENT_LABEL: Record<EventKind, string> = {
  edd_raised: "EDD Raised", str_filed: "STR Filed", case_opened: "Case Opened",
  screening_hit: "Screening Hit", sanctions_match: "Sanctions Match", pep_match: "PEP Match",
  interview: "Interview", document_request: "Doc Request", other: "Other",
};

const EVENT_COLOR: Record<EventKind, string> = {
  edd_raised:       "text-amber border-amber/40 bg-amber/10",
  str_filed:        "text-red border-red/40 bg-red/10",
  case_opened:      "text-blue-400 border-blue-400/40 bg-blue-900/20",
  screening_hit:    "text-red border-red/40 bg-red/10",
  sanctions_match:  "text-red border-red/40 bg-red/10",
  pep_match:        "text-orange-400 border-orange-400/40 bg-orange-900/20",
  interview:        "text-green border-green/40 bg-green/10",
  document_request: "text-brand border-brand/40 bg-brand/10",
  other:            "text-ink-2 border-hair-2 bg-bg-2",
};

// Fixed viewBox coordinate system — no drag/zoom needed
const VW = 640;
const VH = 440;
const CX = VW / 2;
const CY = VH / 2;

function partyPos(i: number, total: number): { x: number; y: number } {
  const R = total <= 3 ? 145 : total <= 6 ? 160 : total <= 10 ? 170 : 178;
  const angle = (2 * Math.PI * i / total) - Math.PI / 2;
  return { x: Math.round(CX + R * Math.cos(angle)), y: Math.round(CY + R * Math.sin(angle)) };
}

export default function InvestigationPage() {
  const [subject, setSubject] = useState("");
  const [committed, setCommitted] = useState("");
  const [parties, setParties] = useState<RelatedParty[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [addingParty, setAddingParty] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<PartyKind>("counterparty");
  const [newRel, setNewRel] = useState("");

  const [addingEvent, setAddingEvent] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newEvKind, setNewEvKind] = useState<EventKind>("case_opened");
  const [newDesc, setNewDesc] = useState("");

  const [allCases, setAllCases] = useState<CaseRecord[]>([]);
  const [showSug, setShowSug] = useState(false);

  const [brainLoading, setBrainLoading] = useState(false);
  const [brainAnalysis, setBrainAnalysis] = useState<BrainAnalysis | null>(null);
  const [exportingPack, setExportingPack] = useState(false);
  const [packReady, setPackReady] = useState(false);

  useEffect(() => { setAllCases(loadCases()); }, []);

  const suggestions = useMemo(() => {
    const q = subject.trim().toLowerCase();
    return Array.from(new Set(allCases.map((c) => c.subject))).sort()
      .filter((n) => n.toLowerCase().includes(q)).slice(0, 6);
  }, [subject, allCases]);

  const matchedCases = useMemo(() =>
    allCases.filter((c) => c.subject.toLowerCase() === committed.toLowerCase()),
  [allCases, committed]);

  const highlightedIds = useMemo<Set<string>>(() => {
    if (!selectedId) return new Set();
    if (selectedId === "subject") return new Set(["subject", ...parties.map((p) => p.id)]);
    return new Set(["subject", selectedId]);
  }, [selectedId, parties]);

  function commitSubject(name: string) {
    const t = name.trim();
    if (!t) return;
    setSubject(t);
    setCommitted(t);
    setShowSug(false);
    setBrainAnalysis(null);
    setPackReady(false);
    setSelectedId(null);
  }

  function addParty() {
    if (!newName.trim()) return;
    setParties((prev) => [...prev, {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: newName.trim(),
      kind: newKind,
      relationship: newRel.trim() || PARTY_LABEL[newKind].toLowerCase(),
    }]);
    setNewName(""); setNewRel(""); setAddingParty(false);
  }

  function removeParty(id: string) {
    setParties((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function addEvent() {
    if (!newDate) return;
    setEvents((prev) => [...prev, {
      id: `ev-${Date.now()}`,
      date: newDate, kind: newEvKind,
      description: newDesc.trim(),
    }]);
    setNewDate(""); setNewDesc(""); setAddingEvent(false);
  }

  const runBrain = useCallback(async () => {
    if (!committed) return;
    setBrainLoading(true); setBrainAnalysis(null);
    try {
      const res = await fetch("/api/mlro-advisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: `Generate a link-analysis investigation brief for subject ${committed}. Connected cases: ${matchedCases.map((c) => c.id).join(", ") || "none"}. Typologies indicated? Relationships to investigate? Overall risk level?`,
          subjectName: committed,
          mode: "forensic",
          audience: "mlro",
        }),
      });
      let narrative = "";
      if (res.ok) { const d = await res.json() as { narrative?: string }; narrative = d.narrative ?? ""; }
      const lower = narrative.toLowerCase();
      setBrainAnalysis({
        narrative: narrative || "No narrative generated.",
        typologies: ["Layering", "Structuring"],
        keyRelationships: matchedCases.length > 0
          ? [`${matchedCases.length} case${matchedCases.length !== 1 ? "s" : ""} on record`]
          : ["No cases on record"],
        nextSteps: ["Review all connected entities", "Escalate if typology signals confirmed"],
        riskLevel:
          lower.includes("critical") || lower.includes("immediate") ? "critical"
          : lower.includes("high risk") || lower.includes("significant") ? "high"
          : lower.includes("low risk") || lower.includes("minimal") ? "low"
          : "medium",
      });
    } catch { /* silent */ }
    finally { setBrainLoading(false); }
  }, [committed, matchedCases]);

  const runPack = useCallback(async () => {
    if (!committed) return;
    setExportingPack(true);
    try {
      await fetch("/api/investigation/evidence-pack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          caseTitle: `Investigation: ${committed}`,
          entities: [
            { id: "subject", name: committed, kind: "subject", riskScore: 80 },
            ...parties.map((p) => ({ id: p.id, name: p.name, kind: p.kind, riskScore: 60 })),
          ],
          links: parties.map((p) => ({ from: committed, to: p.name, label: p.relationship, suggested: false })),
          narrative: brainAnalysis?.narrative ?? "",
          analyst: "Hawkeye Sterling Analyst",
        }),
      });
      setPackReady(true);
    } catch { /* silent */ }
    finally { setExportingPack(false); }
  }, [committed, parties, brainAnalysis]);

  const sortedEvents = useMemo(() =>
    [...events].sort((a, b) => a.date.localeCompare(b.date)),
  [events]);

  const inputCls = "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 placeholder:text-ink-4 focus:outline-none focus:border-brand";
  const selectCls = "w-full text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:outline-none focus:border-brand";
  const riskBadge: Record<string, string> = {
    critical: "bg-red text-white", high: "bg-red-dim text-red",
    medium: "bg-amber-dim text-amber", low: "bg-green-dim text-green",
  };

  return (
    <ModuleLayout asanaModule="investigation" asanaLabel="Investigation">
      <ModuleHero
        moduleNumber={41}
        eyebrow="Module 12 · Link Analysis"
        title="Investigation"
        titleEm="canvas."
        intro={
          <>
            <strong>Build the network, surface the connections.</strong> Add the subject, related parties, and key timeline events on the left. The network graph updates live on the right — click any node to highlight its connections.
          </>
        }
      />

      <div className="mt-4 grid grid-cols-[360px_1fr] gap-4 items-start">

        {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Subject */}
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-4">
            <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">Subject</div>
            <div className="relative">
              <input
                type="text"
                value={subject}
                placeholder="Entity or individual name…"
                onChange={(e) => { setSubject(e.target.value); setShowSug(true); }}
                onFocus={() => setShowSug(true)}
                onBlur={() => setTimeout(() => setShowSug(false), 150)}
                onKeyDown={(e) => { if (e.key === "Enter") commitSubject(subject); if (e.key === "Escape") setShowSug(false); }}
                className={inputCls}
              />
              {showSug && suggestions.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-bg-panel border border-hair-2 rounded-lg shadow-lg overflow-hidden">
                  {suggestions.map((n) => (
                    <button key={n} type="button" onMouseDown={() => commitSubject(n)}
                      className="w-full text-left px-3 py-2 text-12 text-ink-1 hover:bg-brand-dim hover:text-brand-deep transition-colors">
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" onClick={() => commitSubject(subject)}
              className="mt-2 w-full text-11 font-semibold py-1.5 rounded bg-brand text-white hover:opacity-90">
              Set subject
            </button>
            {committed && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-10 font-mono text-brand font-semibold truncate">{committed}</span>
                {matchedCases.length > 0 && (
                  <span className="text-10 font-mono text-amber shrink-0">
                    {matchedCases.length} case{matchedCases.length !== 1 ? "s" : ""} on record
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Related Parties */}
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2">
                Related Parties
                {parties.length > 0 && <span className="ml-1.5 font-mono text-ink-3 normal-case">({parties.length})</span>}
              </div>
              <button type="button" onClick={() => setAddingParty((v) => !v)}
                className="text-10 font-semibold px-2 py-1 rounded border border-brand text-brand hover:bg-brand-dim transition-colors">
                + Add
              </button>
            </div>

            {addingParty && (
              <div className="mb-3 p-3 bg-bg-1 rounded-lg border border-hair-2 space-y-2">
                <input autoFocus type="text" value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addParty(); if (e.key === "Escape") setAddingParty(false); }}
                  placeholder="Name…" className={inputCls} />
                <div className="grid grid-cols-2 gap-2">
                  <select value={newKind} onChange={(e) => setNewKind(e.target.value as PartyKind)} className={selectCls}>
                    {(Object.keys(PARTY_LABEL) as PartyKind[]).map((k) => (
                      <option key={k} value={k}>{PARTY_LABEL[k]}</option>
                    ))}
                  </select>
                  <input type="text" value={newRel} onChange={(e) => setNewRel(e.target.value)}
                    placeholder="Relationship…" className={inputCls} />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={addParty}
                    className="flex-1 text-11 font-semibold py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1">Add</button>
                  <button type="button" onClick={() => setAddingParty(false)}
                    className="flex-1 text-11 py-1.5 rounded border border-hair-2 text-ink-2 hover:text-ink-0">Cancel</button>
                </div>
              </div>
            )}

            {parties.length === 0 && !addingParty && (
              <p className="text-11 text-ink-4 py-2 text-center italic">No parties added yet.</p>
            )}

            <div className="space-y-1.5">
              {parties.map((p) => {
                const cfg = PARTY_COLOR[p.kind];
                const isSelected = selectedId === p.id;
                return (
                  <div key={p.id}
                    onClick={() => setSelectedId(isSelected ? null : p.id)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      isSelected ? "border-brand bg-brand-dim" : "border-hair-2 hover:border-hair bg-bg-1"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.stroke }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-11 font-semibold text-ink-0 truncate">{p.name}</span>
                      </div>
                      <div className="text-10 text-ink-3 font-mono">
                        {PARTY_LABEL[p.kind]} · {p.relationship}
                      </div>
                    </div>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); removeParty(p.id); }}
                      className="text-ink-4 hover:text-red transition-colors text-13 shrink-0">×</button>
                  </div>
                );
              })}
            </div>

          </div>

          {/* Timeline */}
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2">
                Timeline
                {events.length > 0 && <span className="ml-1.5 font-mono text-ink-3 normal-case">({events.length})</span>}
              </div>
              <button type="button" onClick={() => setAddingEvent((v) => !v)}
                className="text-10 font-semibold px-2 py-1 rounded border border-brand text-brand hover:bg-brand-dim transition-colors">
                + Add
              </button>
            </div>

            {addingEvent && (
              <div className="mb-3 p-3 bg-bg-1 rounded-lg border border-hair-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputCls} />
                  <select value={newEvKind} onChange={(e) => setNewEvKind(e.target.value as EventKind)} className={selectCls}>
                    {(Object.keys(EVENT_LABEL) as EventKind[]).map((k) => (
                      <option key={k} value={k}>{EVENT_LABEL[k]}</option>
                    ))}
                  </select>
                </div>
                <input type="text" value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addEvent(); if (e.key === "Escape") setAddingEvent(false); }}
                  placeholder="Description (optional)…" className={inputCls} />
                <div className="flex gap-2">
                  <button type="button" onClick={addEvent}
                    className="flex-1 text-11 font-semibold py-1.5 rounded bg-ink-0 text-bg-0 hover:bg-ink-1">Add</button>
                  <button type="button" onClick={() => setAddingEvent(false)}
                    className="flex-1 text-11 py-1.5 rounded border border-hair-2 text-ink-2 hover:text-ink-0">Cancel</button>
                </div>
              </div>
            )}

            {events.length === 0 && !addingEvent && (
              <p className="text-11 text-ink-4 py-2 text-center italic">No events added yet.</p>
            )}

            <div className="space-y-1.5">
              {sortedEvents.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2.5 px-3 py-2 rounded-lg border border-hair-2 bg-bg-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-10 text-ink-3">{ev.date}</span>
                      <span className={`text-9 font-mono font-semibold px-1.5 py-px rounded border ${EVENT_COLOR[ev.kind]}`}>
                        {EVENT_LABEL[ev.kind]}
                      </span>
                    </div>
                    {ev.description && <div className="text-11 text-ink-1 mt-0.5">{ev.description}</div>}
                  </div>
                  <button type="button"
                    onClick={() => setEvents((prev) => prev.filter((e) => e.id !== ev.id))}
                    className="text-ink-4 hover:text-red transition-colors text-13 shrink-0 mt-0.5">×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Analysis */}
          <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 space-y-2">
            <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-1">Analysis</div>
            <button type="button" onClick={() => void runBrain()}
              disabled={brainLoading || !committed}
              className="w-full text-11 font-semibold py-2 rounded border border-brand text-brand hover:bg-brand-dim disabled:opacity-40 transition-colors">
              {brainLoading ? "Analyzing…" : "🧠 Generate Brain Analysis"}
            </button>
            <button type="button" onClick={() => void runPack()}
              disabled={exportingPack || !committed}
              className="w-full text-11 font-semibold py-2 rounded border border-amber/50 text-amber hover:bg-amber/10 disabled:opacity-40 transition-colors">
              {exportingPack ? "Generating…" : packReady ? "📦 Pack ready — click to re-generate" : "📦 Export Evidence Pack"}
            </button>
            {packReady && (
              <button type="button" onClick={() => window.print()}
                className="w-full text-11 font-semibold py-2 rounded bg-amber/10 border border-amber/40 text-amber hover:bg-amber/20 transition-colors">
                ↓ Print / Export PDF
              </button>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Network Graph */}
          <div className="bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-hair-2">
              <span className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2">Network Graph</span>
              {selectedId && (
                <button type="button" onClick={() => setSelectedId(null)}
                  className="text-10 text-ink-3 hover:text-ink-1 transition-colors">
                  ✕ Clear selection
                </button>
              )}
            </div>

            <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: "block", background: "#0a0d0f" }}>
              <defs>
                <marker id="inv-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="#334155" />
                </marker>
                <marker id="inv-arr-hi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="#f472b6" />
                </marker>
                <filter id="inv-glow">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {!committed && (
                <text x={VW / 2} y={VH / 2} textAnchor="middle" dominantBaseline="middle"
                  style={{ fill: "#334155", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>
                  Set a subject to build the network
                </text>
              )}

              {/* Edges */}
              {committed && parties.map((p, i) => {
                const pos = partyPos(i, parties.length);
                const isHi = highlightedIds.has(p.id);
                const faded = selectedId !== null && !isHi;
                return (
                  <g key={`e-${p.id}`} style={{ opacity: faded ? 0.07 : 1, transition: "opacity 0.2s" }}>
                    <line
                      x1={CX} y1={CY} x2={pos.x} y2={pos.y}
                      stroke={isHi && selectedId ? "#f472b6" : "#334155"}
                      strokeWidth={isHi && selectedId ? 1.5 : 1}
                      markerEnd={isHi && selectedId ? "url(#inv-arr-hi)" : "url(#inv-arr)"}
                      style={{ opacity: isHi && selectedId ? 0.85 : 0.45 }}
                    />
                    <text
                      x={(CX + pos.x) / 2} y={(CY + pos.y) / 2 - 7}
                      textAnchor="middle"
                      style={{
                        fill: isHi && selectedId ? "#f472b6" : "#475569",
                        fontSize: 9, fontFamily: "monospace",
                        opacity: isHi && selectedId ? 0.9 : 0.55,
                      }}
                    >
                      {p.relationship}
                    </text>
                  </g>
                );
              })}

              {/* Subject node */}
              {committed && (() => {
                const isSel = selectedId === "subject";
                const W = 162, H = 44;
                return (
                  <g style={{ cursor: "pointer", filter: "url(#inv-glow)" }}
                    onClick={() => setSelectedId(isSel ? null : "subject")}>
                    {isSel && (
                      <rect x={CX - W / 2 - 5} y={CY - H / 2 - 5} width={W + 10} height={H + 10} rx={12}
                        fill="none" stroke="#f472b6" strokeWidth={1.5} style={{ opacity: 0.35 }} />
                    )}
                    <rect x={CX - W / 2} y={CY - H / 2} width={W} height={H} rx={8}
                      fill="#2d1524" stroke="#f472b6" strokeWidth={isSel ? 2.5 : 2} />
                    <text x={CX - W / 2 + 14} y={CY + 5}
                      style={{ fontSize: 13, fill: "#f472b6", fontFamily: "monospace" }}>◆</text>
                    <text x={CX - W / 2 + 30} y={CY + 5}
                      style={{ fontSize: 11.5, fill: "#fce7f3", fontWeight: 700, fontFamily: "system-ui, sans-serif" }}>
                      {committed.length > 20 ? committed.slice(0, 18) + "…" : committed}
                    </text>
                  </g>
                );
              })()}

              {/* Party nodes */}
              {committed && parties.map((p, i) => {
                const pos = partyPos(i, parties.length);
                const cfg = PARTY_COLOR[p.kind];
                const isSel = selectedId === p.id;
                const isHi = highlightedIds.has(p.id);
                const faded = selectedId !== null && !isHi;
                const W = 140, H = 38;
                return (
                  <g key={p.id}
                    style={{ cursor: "pointer", opacity: faded ? 0.12 : 1, transition: "opacity 0.2s" }}
                    onClick={() => setSelectedId(isSel ? null : p.id)}>
                    {isSel && (
                      <rect x={pos.x - W / 2 - 4} y={pos.y - H / 2 - 4} width={W + 8} height={H + 8} rx={10}
                        fill="none" stroke={cfg.stroke} strokeWidth={1.5} style={{ opacity: 0.4 }} />
                    )}
                    <rect x={pos.x - W / 2} y={pos.y - H / 2} width={W} height={H} rx={7}
                      fill={cfg.fill} stroke={cfg.stroke}
                      strokeWidth={isSel ? 2.5 : 1.5} />
                    <text x={pos.x - W / 2 + 12} y={pos.y + 4}
                      style={{ fontSize: 12, fill: cfg.stroke, fontFamily: "monospace" }}>
                      {PARTY_ICON[p.kind]}
                    </text>
                    <text x={pos.x - W / 2 + 28} y={pos.y + 4}
                      style={{ fontSize: 10.5, fill: cfg.text, fontWeight: 600, fontFamily: "system-ui, sans-serif" }}>
                      {p.name.length > 15 ? p.name.slice(0, 13) + "…" : p.name}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="px-4 py-2 border-t border-hair-2 flex items-center gap-3 flex-wrap"
              style={{ background: "#080b0d" }}>
              {(Object.entries(PARTY_COLOR) as [PartyKind, typeof PARTY_COLOR[PartyKind]][]).map(([kind, cfg]) => (
                <span key={kind} className="flex items-center gap-1 text-10 font-mono" style={{ color: cfg.stroke }}>
                  <span>{PARTY_ICON[kind]}</span>
                  <span>{PARTY_LABEL[kind]}</span>
                </span>
              ))}
              <span className="ml-auto text-10 font-mono text-ink-4">click node · connections highlight</span>
            </div>
          </div>

          {/* Brain Analysis */}
          {(brainLoading || brainAnalysis) && (
            <div className="bg-bg-panel border border-hair-2 rounded-xl p-4">
              <div className="text-10 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">Brain Analysis</div>
              {brainLoading && (
                <p className="font-mono text-11 text-ink-3 animate-pulse">
                  Analyzing <span className="text-ink-1 font-semibold">{committed}</span>…
                </p>
              )}
              {brainAnalysis && !brainLoading && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-mono text-10 px-2 py-px rounded font-bold uppercase ${riskBadge[brainAnalysis.riskLevel]}`}>
                      {brainAnalysis.riskLevel} risk
                    </span>
                    {brainAnalysis.typologies.map((t) => (
                      <span key={t} className="font-mono text-10 px-1.5 py-px rounded bg-red-dim text-red border border-red/20">{t}</span>
                    ))}
                  </div>
                  <p className="text-12 text-ink-1 leading-relaxed">{brainAnalysis.narrative}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Key Relationships</div>
                      <ul className="text-11 text-ink-2 space-y-0.5 list-disc list-inside">
                        {brainAnalysis.keyRelationships.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                    <div>
                      <div className="text-10 font-mono uppercase tracking-wide-3 text-ink-3 mb-1">Next Steps</div>
                      <ol className="text-11 text-ink-2 space-y-0.5 list-decimal list-inside">
                        {brainAnalysis.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ModuleLayout>
  );
}
