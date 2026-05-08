"use client";

// Hawkeye Sterling — weaponized side-by-side subject compare panel.
//
// Runs useSuperBrain concurrently for both subjects and overlays
// brain intelligence: composite scores, fired redlines, cross-regime
// conflict, PEP assessment, typology hits, and CAHRA flags.

import { useEffect } from "react";
import type { Subject } from "@/lib/types";
import { useSuperBrain } from "@/lib/hooks/useSuperBrain";
import { writeAuditEvent } from "@/lib/audit";

interface Props {
  subjectA: Subject;
  subjectB: Subject;
  onClose: () => void;
  onSelect: (id: string) => void;
}

function riskColor(score: number): string {
  if (score >= 85) return "text-red";
  if (score >= 60) return "text-amber";
  if (score >= 30) return "text-yellow-500";
  return "text-green";
}

function riskBg(score: number): string {
  if (score >= 85) return "bg-red";
  if (score >= 60) return "bg-amber";
  if (score >= 30) return "bg-yellow-400";
  return "bg-green";
}

function cddBadge(posture: string): string {
  if (posture === "EDD") return "bg-red-dim text-red border border-red/30";
  if (posture === "SDD") return "bg-green-dim text-green border border-green/30";
  return "bg-bg-2 text-ink-2 border border-hair-2";
}

function statusBadge(status: string): string {
  if (status === "frozen") return "bg-red-dim text-red border border-red/30";
  if (status === "cleared") return "bg-green-dim text-green border border-green/30";
  return "bg-bg-2 text-ink-2 border border-hair-2";
}

interface RowProps {
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
  differ?: boolean;
  critical?: boolean;
}

function CompareRow({ label, a, b, differ, critical }: RowProps) {
  return (
    <div className={`grid grid-cols-[140px_1fr_1fr] gap-2 py-1.5 border-b border-hair-2 text-12 ${
      critical ? "bg-red-dim/30" : differ ? "bg-amber-dim/40" : ""
    }`}>
      <div className="text-ink-3 font-medium pl-2 flex items-center">{label}</div>
      <div className="text-ink-0 pr-2">{a}</div>
      <div className="text-ink-0 pr-2">{b}</div>
    </div>
  );
}

export function ComparePanel({ subjectA, subjectB, onClose, onSelect }: Props): JSX.Element {
  // Run brain concurrently for both subjects
  const brainA = useSuperBrain(
    { name: subjectA.name, entityType: subjectA.entityType, jurisdiction: subjectA.jurisdiction },
    { roleText: subjectA.pep?.tier },
  );
  const brainB = useSuperBrain(
    { name: subjectB.name, entityType: subjectB.entityType, jurisdiction: subjectB.jurisdiction },
    { roleText: subjectB.pep?.tier },
  );

  useEffect(() => {
    writeAuditEvent(
      "analyst",
      "subject.compare",
      `${subjectA.name} (${subjectA.id}) ↔ ${subjectB.name} (${subjectB.id})`,
    );
  }, [subjectA.id, subjectB.id, subjectA.name, subjectB.name]);

  const rA = brainA.status === "success" ? brainA.result : null;
  const rB = brainB.status === "success" ? brainB.result : null;

  // Composite scores: prefer brain result, fall back to riskScore
  const compA = rA?.composite?.score ?? subjectA.riskScore;
  const compB = rB?.composite?.score ?? subjectB.riskScore;
  const scoreDiff = Math.abs(compA - compB);

  // Redlines
  const redlinesA = rA?.redlines?.fired ?? [];
  const redlinesB = rB?.redlines?.fired ?? [];
  const criticalA = rA?.redlines?.action != null &&
    (rA.redlines.action.includes("block") || rA.redlines.action.includes("freeze") || rA.redlines.action.includes("exit"));
  const criticalB = rB?.redlines?.action != null &&
    (rB.redlines.action.includes("block") || rB.redlines.action.includes("freeze") || rB.redlines.action.includes("exit"));

  // Cross-regime
  const crossA = rA?.crossRegimeConflict;
  const crossB = rB?.crossRegimeConflict;

  // PEP
  const pepA = rA?.pepAssessment ?? rA?.pep;
  const pepB = rB?.pepAssessment ?? rB?.pep;

  // List diff
  const listsDiff = JSON.stringify([...subjectA.listCoverage].sort()) !==
    JSON.stringify([...subjectB.listCoverage].sort());

  // CAHRA from brain
  const cahraA = rA?.jurisdiction?.cahra ?? false;
  const cahraB = rB?.jurisdiction?.cahra ?? false;

  return (
    <aside className="border-l border-[#ec4899] overflow-y-auto flex flex-col bg-bg-panel">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg-panel border-b border-hair-2 px-4 py-3 flex items-center justify-between">
        <div className="text-12 font-semibold text-ink-0 uppercase tracking-wide">Side-by-side Compare</div>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-3 hover:text-ink-0 text-16 leading-none px-1"
          title="Close compare"
        >
          ×
        </button>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[140px_1fr_1fr] gap-2 px-0 py-2 border-b border-hair-2 bg-bg-2">
        <div className="pl-2 text-11 text-ink-3 uppercase tracking-wide">Field</div>
        <button
          type="button"
          onClick={() => onSelect(subjectA.id)}
          className="text-left pr-2 hover:text-brand transition-colors"
        >
          <div className="text-12 font-semibold text-ink-0 truncate">{subjectA.name}</div>
          <div className="text-11 text-ink-3 font-mono">{subjectA.id}</div>
          {brainA.status === "loading" && <div className="text-10 text-ink-3 italic">brain loading…</div>}
          {brainA.status === "error" && <div className="text-10 text-amber italic">{brainA.error}</div>}
        </button>
        <button
          type="button"
          onClick={() => onSelect(subjectB.id)}
          className="text-left pr-2 hover:text-brand transition-colors"
        >
          <div className="text-12 font-semibold text-ink-0 truncate">{subjectB.name}</div>
          <div className="text-11 text-ink-3 font-mono">{subjectB.id}</div>
          {brainB.status === "loading" && <div className="text-10 text-ink-3 italic">brain loading…</div>}
          {brainB.status === "error" && <div className="text-10 text-amber italic">{brainB.error}</div>}
        </button>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto text-12">
        {/* Brain composite score */}
        <div className={`grid grid-cols-[140px_1fr_1fr] gap-2 py-2 border-b border-hair-2 ${scoreDiff >= 20 ? "bg-amber-dim/40" : ""}`}>
          <div className="text-ink-3 font-medium pl-2 flex items-center text-12">Brain composite</div>
          <div className="pr-2">
            <div className={`text-20 font-bold font-mono leading-none ${riskColor(compA)}`}>{compA}</div>
            <div className="mt-1 h-1.5 w-full rounded bg-bg-2 overflow-hidden">
              <div className={`h-full rounded ${riskBg(compA)}`} style={{ width: `${compA}%` }} />
            </div>
            {rA?.composite?.breakdown && (
              <div className="mt-1 flex flex-wrap gap-1">
                {Object.entries(rA.composite.breakdown).slice(0, 4).map(([k, v]) => (
                  <span key={k} className="text-9 font-mono text-ink-3">{k}:{Math.round(v)}</span>
                ))}
              </div>
            )}
          </div>
          <div className="pr-2">
            <div className={`text-20 font-bold font-mono leading-none ${riskColor(compB)}`}>{compB}</div>
            <div className="mt-1 h-1.5 w-full rounded bg-bg-2 overflow-hidden">
              <div className={`h-full rounded ${riskBg(compB)}`} style={{ width: `${compB}%` }} />
            </div>
            {rB?.composite?.breakdown && (
              <div className="mt-1 flex flex-wrap gap-1">
                {Object.entries(rB.composite.breakdown).slice(0, 4).map(([k, v]) => (
                  <span key={k} className="text-9 font-mono text-ink-3">{k}:{Math.round(v)}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Redlines */}
        <CompareRow
          label="Redlines fired"
          critical={(criticalA || criticalB) && (redlinesA.length > 0 || redlinesB.length > 0)}
          differ={redlinesA.length !== redlinesB.length}
          a={redlinesA.length > 0
            ? <div className="space-y-0.5">
                {redlinesA.map((r, i) => (
                  <div key={i} className="text-10 font-mono text-red">{r.id ?? r.label ?? "redline"}</div>
                ))}
                {rA?.redlines?.action && (
                  <div className="text-10 font-bold text-red uppercase">{rA.redlines.action}</div>
                )}
              </div>
            : <span className="text-ink-3 text-10">none</span>}
          b={redlinesB.length > 0
            ? <div className="space-y-0.5">
                {redlinesB.map((r, i) => (
                  <div key={i} className="text-10 font-mono text-red">{r.id ?? r.label ?? "redline"}</div>
                ))}
                {rB?.redlines?.action && (
                  <div className="text-10 font-bold text-red uppercase">{rB.redlines.action}</div>
                )}
              </div>
            : <span className="text-ink-3 text-10">none</span>}
        />

        {/* Cross-regime conflict */}
        <CompareRow
          label="Cross-regime"
          differ={crossA?.split !== crossB?.split}
          a={crossA
            ? <div>
                <span className={`text-10 font-bold uppercase ${crossA.unanimousDesignated ? "text-red" : crossA.split ? "text-amber" : "text-green"}`}>
                  {crossA.unanimousDesignated ? "UNANIMOUS DESIGNATED" : crossA.split ? "SPLIT" : crossA.anyDesignated ? "PARTIALLY DESIGNATED" : "clear"}
                </span>
                {crossA.recommendedAction && (
                  <div className="text-9 font-mono text-ink-3 mt-0.5">{crossA.recommendedAction}</div>
                )}
              </div>
            : <span className="text-ink-3 text-10">{brainA.status === "loading" ? "…" : "—"}</span>}
          b={crossB
            ? <div>
                <span className={`text-10 font-bold uppercase ${crossB.unanimousDesignated ? "text-red" : crossB.split ? "text-amber" : "text-green"}`}>
                  {crossB.unanimousDesignated ? "UNANIMOUS DESIGNATED" : crossB.split ? "SPLIT" : crossB.anyDesignated ? "PARTIALLY DESIGNATED" : "clear"}
                </span>
                {crossB.recommendedAction && (
                  <div className="text-9 font-mono text-ink-3 mt-0.5">{crossB.recommendedAction}</div>
                )}
              </div>
            : <span className="text-ink-3 text-10">{brainB.status === "loading" ? "…" : "—"}</span>}
        />

        {/* PEP assessment from brain */}
        <CompareRow
          label="PEP (brain)"
          differ={(pepA != null) !== (pepB != null)}
          a={pepA && "isLikelyPEP" in pepA
            ? <div>
                <span className="text-10 font-bold text-amber">{pepA.highestTier}</span>
                <span className="ml-1 text-10 text-ink-2">score {pepA.riskScore}</span>
                {pepA.matchedRoles?.slice(0, 2).map((r, i) => (
                  <div key={i} className="text-9 text-ink-3">{r.label}</div>
                ))}
              </div>
            : pepA && "tier" in pepA
            ? <span className="text-10 font-semibold text-amber">{pepA.tier}</span>
            : <span className="text-ink-3 text-10">{brainA.status === "loading" ? "…" : "—"}</span>}
          b={pepB && "isLikelyPEP" in pepB
            ? <div>
                <span className="text-10 font-bold text-amber">{pepB.highestTier}</span>
                <span className="ml-1 text-10 text-ink-2">score {pepB.riskScore}</span>
                {pepB.matchedRoles?.slice(0, 2).map((r, i) => (
                  <div key={i} className="text-9 text-ink-3">{r.label}</div>
                ))}
              </div>
            : pepB && "tier" in pepB
            ? <span className="text-10 font-semibold text-amber">{pepB.tier}</span>
            : <span className="text-ink-3 text-10">{brainB.status === "loading" ? "…" : "—"}</span>}
        />

        {/* Typologies */}
        <CompareRow
          label="Typologies"
          differ={(rA?.typologies?.hits?.length ?? 0) !== (rB?.typologies?.hits?.length ?? 0)}
          a={rA?.typologies?.hits?.length
            ? <div>
                <span className="text-10 font-bold text-amber">{rA.typologies.compositeScore} composite</span>
                {rA.typologies.hits.slice(0, 3).map((h, i) => (
                  <div key={i} className="text-9 text-ink-2 font-mono">{h.name}</div>
                ))}
              </div>
            : <span className="text-ink-3 text-10">{brainA.status === "loading" ? "…" : "none"}</span>}
          b={rB?.typologies?.hits?.length
            ? <div>
                <span className="text-10 font-bold text-amber">{rB.typologies.compositeScore} composite</span>
                {rB.typologies.hits.slice(0, 3).map((h, i) => (
                  <div key={i} className="text-9 text-ink-2 font-mono">{h.name}</div>
                ))}
              </div>
            : <span className="text-ink-3 text-10">{brainB.status === "loading" ? "…" : "none"}</span>}
        />

        {/* Adverse keyword groups */}
        <CompareRow
          label="Adverse keywords"
          differ={(rA?.adverseKeywordGroups?.length ?? 0) !== (rB?.adverseKeywordGroups?.length ?? 0)}
          a={rA?.adverseKeywordGroups?.length
            ? <div className="flex flex-wrap gap-0.5">
                {rA.adverseKeywordGroups.slice(0, 4).map((g, i) => (
                  <span key={i} className="text-9 font-mono px-1 rounded bg-red-dim text-red">{g.label} ({g.count})</span>
                ))}
              </div>
            : <span className="text-ink-3 text-10">{brainA.status === "loading" ? "…" : "—"}</span>}
          b={rB?.adverseKeywordGroups?.length
            ? <div className="flex flex-wrap gap-0.5">
                {rB.adverseKeywordGroups.slice(0, 4).map((g, i) => (
                  <span key={i} className="text-9 font-mono px-1 rounded bg-red-dim text-red">{g.label} ({g.count})</span>
                ))}
              </div>
            : <span className="text-ink-3 text-10">{brainB.status === "loading" ? "…" : "—"}</span>}
        />

        {/* CAHRA flag */}
        <CompareRow
          label="CAHRA"
          differ={cahraA !== cahraB}
          critical={cahraA || cahraB}
          a={cahraA
            ? <span className="text-10 font-bold text-red uppercase">CAHRA jurisdiction</span>
            : <span className="text-ink-3 text-10">{brainA.status === "loading" ? "…" : "—"}</span>}
          b={cahraB
            ? <span className="text-10 font-bold text-red uppercase">CAHRA jurisdiction</span>
            : <span className="text-ink-3 text-10">{brainB.status === "loading" ? "…" : "—"}</span>}
        />

        <CompareRow
          label="Status"
          differ={subjectA.status !== subjectB.status}
          a={<span className={`text-11 px-1.5 py-0.5 rounded ${statusBadge(subjectA.status)}`}>{subjectA.status}</span>}
          b={<span className={`text-11 px-1.5 py-0.5 rounded ${statusBadge(subjectB.status)}`}>{subjectB.status}</span>}
        />
        <CompareRow
          label="CDD posture"
          differ={subjectA.cddPosture !== subjectB.cddPosture}
          a={<span className={`text-11 px-1.5 py-0.5 rounded font-semibold ${cddBadge(subjectA.cddPosture)}`}>{subjectA.cddPosture}</span>}
          b={<span className={`text-11 px-1.5 py-0.5 rounded font-semibold ${cddBadge(subjectB.cddPosture)}`}>{subjectB.cddPosture}</span>}
        />
        <CompareRow
          label="Jurisdiction"
          differ={subjectA.jurisdiction !== subjectB.jurisdiction}
          a={<span className="font-mono text-ink-0">{subjectA.jurisdiction || "—"}</span>}
          b={<span className="font-mono text-ink-0">{subjectB.jurisdiction || "—"}</span>}
        />
        <CompareRow
          label="Entity type"
          differ={subjectA.entityType !== subjectB.entityType}
          a={<span className="text-ink-0">{subjectA.entityType}</span>}
          b={<span className="text-ink-0">{subjectB.entityType}</span>}
        />
        <CompareRow
          label="List coverage"
          differ={listsDiff}
          a={
            subjectA.listCoverage.length > 0
              ? <div className="flex flex-wrap gap-1">{subjectA.listCoverage.map((l) => (
                  <span key={l} className="bg-red-dim text-red text-10 px-1 rounded">{l}</span>
                ))}</div>
              : <span className="text-ink-3">none</span>
          }
          b={
            subjectB.listCoverage.length > 0
              ? <div className="flex flex-wrap gap-1">{subjectB.listCoverage.map((l) => (
                  <span key={l} className="bg-red-dim text-red text-10 px-1 rounded">{l}</span>
                ))}</div>
              : <span className="text-ink-3">none</span>
          }
        />
        <CompareRow
          label="Most serious"
          differ={subjectA.mostSerious !== subjectB.mostSerious}
          a={<span className="font-mono text-ink-0">{subjectA.mostSerious || "—"}</span>}
          b={<span className="font-mono text-ink-0">{subjectB.mostSerious || "—"}</span>}
        />
        <CompareRow
          label="Adverse media"
          differ={(subjectA.adverseMedia != null) !== (subjectB.adverseMedia != null)}
          a={subjectA.adverseMedia
            ? <span className="text-red-400">{subjectA.adverseMedia.reference}</span>
            : <span className="text-ink-3">—</span>}
          b={subjectB.adverseMedia
            ? <span className="text-red-400">{subjectB.adverseMedia.reference}</span>
            : <span className="text-ink-3">—</span>}
        />
        <CompareRow
          label="Exposure AED"
          differ={subjectA.exposureAED !== subjectB.exposureAED}
          a={<span className="font-mono text-ink-0">{subjectA.exposureAED}</span>}
          b={<span className="font-mono text-ink-0">{subjectB.exposureAED}</span>}
        />
        <CompareRow
          label="SLA"
          differ={subjectA.slaNotify !== subjectB.slaNotify}
          a={<span className="font-mono text-ink-0">{subjectA.slaNotify}</span>}
          b={<span className="font-mono text-ink-0">{subjectB.slaNotify}</span>}
        />
        <CompareRow
          label="Opened"
          differ={false}
          a={<span className="text-ink-2">{subjectA.openedAgo}</span>}
          b={<span className="text-ink-2">{subjectB.openedAgo}</span>}
        />
        <CompareRow
          label="Meta"
          differ={false}
          a={<span className="text-ink-2 text-11 leading-snug">{subjectA.meta}</span>}
          b={<span className="text-ink-2 text-11 leading-snug">{subjectB.meta}</span>}
        />
      </div>

      {/* Diff summary / escalation footer */}
      <div className={`border-t border-hair-2 px-4 py-3 ${(criticalA || criticalB) ? "bg-red-dim" : "bg-bg-2"}`}>
        {(criticalA || criticalB) ? (
          <p className="text-11 font-bold text-red uppercase">
            ⛔ Critical redline(s) fired — escalate to MLRO immediately. Freeze or exit relationship per redline action.
          </p>
        ) : scoreDiff >= 20 ? (
          <p className="text-11 text-amber">
            ⚠ Brain composite diverges by {scoreDiff} pts — UBO cross-check recommended.
          </p>
        ) : listsDiff ? (
          <p className="text-11 text-amber">
            ⚠ List coverage differs — verify regime consistency.
          </p>
        ) : (
          <p className="text-11 text-ink-3">
            No material divergence detected between these subjects.
          </p>
        )}
        <p className="text-10 text-ink-3 mt-1">
          Highlighted rows indicate differing values. Click a subject name to open its dossier.
        </p>
      </div>
    </aside>
  );
}

export default ComparePanel;
