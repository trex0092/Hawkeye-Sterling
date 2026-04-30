// Hawkeye Sterling — side-by-side subject compare panel.
//
// Renders two subjects next to each other with risk metrics, status,
// list coverage, PEP, and jurisdiction. Diff cells highlighted when
// the two subjects diverge. Related-party / UBO cross-checks use this.

"use client";

import type { Subject } from "@/lib/types";

interface Props {
  subjectA: Subject;
  subjectB: Subject;
  onClose: () => void;
  onSelect: (id: string) => void;
}

function riskColor(score: number): string {
  if (score >= 85) return "text-red-500";
  if (score >= 60) return "text-amber-500";
  if (score >= 30) return "text-yellow-500";
  return "text-green-500";
}

function riskBg(score: number): string {
  if (score >= 85) return "bg-red-500";
  if (score >= 60) return "bg-amber-500";
  if (score >= 30) return "bg-yellow-400";
  return "bg-green-500";
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
}

function CompareRow({ label, a, b, differ }: RowProps) {
  return (
    <div className={`grid grid-cols-[120px_1fr_1fr] gap-2 py-1.5 border-b border-hair-2 text-12 ${differ ? "bg-amber-dim/40" : ""}`}>
      <div className="text-ink-3 font-medium pl-2 flex items-center">{label}</div>
      <div className="text-ink-0 pr-2">{a}</div>
      <div className="text-ink-0 pr-2">{b}</div>
    </div>
  );
}

export function ComparePanel({ subjectA, subjectB, onClose, onSelect }: Props): JSX.Element {
  const scoreDiff = Math.abs(subjectA.riskScore - subjectB.riskScore);
  const listsDiff = JSON.stringify([...subjectA.listCoverage].sort()) !== JSON.stringify([...subjectB.listCoverage].sort());

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
      <div className="grid grid-cols-[120px_1fr_1fr] gap-2 px-0 py-2 border-b border-hair-2 bg-bg-2">
        <div className="pl-2 text-11 text-ink-3 uppercase tracking-wide">Field</div>
        <button
          type="button"
          onClick={() => onSelect(subjectA.id)}
          className="text-left pr-2 hover:text-brand transition-colors"
        >
          <div className="text-12 font-semibold text-ink-0 truncate">{subjectA.name}</div>
          <div className="text-11 text-ink-3 font-mono">{subjectA.id}</div>
        </button>
        <button
          type="button"
          onClick={() => onSelect(subjectB.id)}
          className="text-left pr-2 hover:text-brand transition-colors"
        >
          <div className="text-12 font-semibold text-ink-0 truncate">{subjectB.name}</div>
          <div className="text-11 text-ink-3 font-mono">{subjectB.id}</div>
        </button>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto text-12">
        {/* Risk score with bar */}
        <div className={`grid grid-cols-[120px_1fr_1fr] gap-2 py-2 border-b border-hair-2 ${scoreDiff >= 20 ? "bg-amber-dim/40" : ""}`}>
          <div className="text-ink-3 font-medium pl-2 flex items-center text-12">Risk score</div>
          <div className="pr-2">
            <div className={`text-20 font-bold font-mono leading-none ${riskColor(subjectA.riskScore)}`}>
              {subjectA.riskScore}
            </div>
            <div className="mt-1 h-1.5 w-full rounded bg-bg-2 overflow-hidden">
              <div className={`h-full rounded ${riskBg(subjectA.riskScore)}`} style={{ width: `${subjectA.riskScore}%` }} />
            </div>
          </div>
          <div className="pr-2">
            <div className={`text-20 font-bold font-mono leading-none ${riskColor(subjectB.riskScore)}`}>
              {subjectB.riskScore}
            </div>
            <div className="mt-1 h-1.5 w-full rounded bg-bg-2 overflow-hidden">
              <div className={`h-full rounded ${riskBg(subjectB.riskScore)}`} style={{ width: `${subjectB.riskScore}%` }} />
            </div>
          </div>
        </div>

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
          label="PEP"
          differ={(subjectA.pep != null) !== (subjectB.pep != null)}
          a={subjectA.pep
            ? <span className="text-amber-400 font-semibold">{subjectA.pep.tier}</span>
            : <span className="text-ink-3">—</span>}
          b={subjectB.pep
            ? <span className="text-amber-400 font-semibold">{subjectB.pep.tier}</span>
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

      {/* Diff summary */}
      <div className="border-t border-hair-2 px-4 py-3 bg-bg-2">
        {scoreDiff >= 20 ? (
          <p className="text-11 text-amber-400">
            ⚠ Risk score diverges by {scoreDiff} pts — UBO cross-check recommended.
          </p>
        ) : listsDiff ? (
          <p className="text-11 text-amber-400">
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
