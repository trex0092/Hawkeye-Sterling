"use client";

import { useMemo, useState } from "react";
import { ANALYSIS, REASONING, SKILLS } from "@/lib/data/taxonomy";
import { MODES } from "@/lib/data/modes";
import { anchorById } from "@/lib/data/anchors";
import { computeCoverage, type PlaybookSatisfaction } from "@/lib/data/coverage";

interface CoveragePanelProps {
  selectedModeIds: Set<string>;
}

export function CoveragePanel({ selectedModeIds }: CoveragePanelProps) {
  const [expandedPlaybook, setExpandedPlaybook] = useState<string | null>(null);

  const report = useMemo(() => {
    const selectedModes = MODES.filter((m) => selectedModeIds.has(m.id));
    return computeCoverage({
      modes: selectedModes,
      totals: {
        skills: SKILLS.length,
        reasoning: REASONING.length,
        analysis: ANALYSIS.length,
      },
    });
  }, [selectedModeIds]);

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 mt-5">
      <div className="flex justify-between items-baseline mb-1">
        <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2">
          Regulatory coverage · MLRO playbooks
        </div>
        <div className="text-11 font-mono text-ink-3">
          <span
            className={`font-semibold ${
              report.overallScore >= 75
                ? "text-green"
                : report.overallScore >= 40
                  ? "text-amber"
                  : "text-red"
            }`}
          >
            {report.overallScore}%
          </span>
          {" · "}overall discharge
        </div>
      </div>
      <div className="text-12 text-ink-2 mb-4">
        Live gap report: which skills, reasoning forms, and analysis surfaces are exercised by
        your current mode selection, and which regulator-facing playbooks can close.
      </div>

      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <CategoryBar
          label="Skills"
          covered={report.bySkills.coveredCount}
          total={report.bySkills.totalCount}
          percent={report.bySkills.percent}
          tone="brand"
        />
        <CategoryBar
          label="Reasoning"
          covered={report.byReasoning.coveredCount}
          total={report.byReasoning.totalCount}
          percent={report.byReasoning.percent}
          tone="violet"
        />
        <CategoryBar
          label="Deep analysis"
          covered={report.byAnalysis.coveredCount}
          total={report.byAnalysis.totalCount}
          percent={report.byAnalysis.percent}
          tone="amber"
        />
      </div>

      <div className="mb-3 flex items-baseline gap-3 flex-wrap text-11">
        <span className="font-semibold tracking-wide-4 uppercase text-ink-2">
          Playbook satisfaction
        </span>
        <span className="text-green font-mono">
          {report.playbooksSatisfied} satisfied
        </span>
        <span className="text-amber font-mono">{report.playbooksPartial} partial</span>
        <span className="text-red font-mono">{report.playbooksUnmet} unmet</span>
      </div>

      <div className="space-y-2">
        {report.playbooks.map((pb) => (
          <PlaybookRow
            key={pb.playbookId}
            pb={pb}
            expanded={expandedPlaybook === pb.playbookId}
            onToggle={() =>
              setExpandedPlaybook((prev) => (prev === pb.playbookId ? null : pb.playbookId))
            }
          />
        ))}
      </div>

      {report.anchorIdsActivated.length > 0 && (
        <div className="mt-5 pt-4 border-t border-hair">
          <div className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2">
            Anchors discharged ({report.anchorIdsActivated.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {report.anchorIdsActivated.map((id) => {
              const a = anchorById(id);
              return (
                <span
                  key={id}
                  title={a?.title ?? id}
                  className="inline-block px-2 py-0.5 rounded-sm bg-green-dim text-green font-mono text-10.5 font-medium tracking-wide-2"
                >
                  {a?.citation ?? id}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryBar({
  label,
  covered,
  total,
  percent,
  tone,
}: {
  label: string;
  covered: number;
  total: number;
  percent: number;
  tone: "brand" | "violet" | "amber";
}) {
  const toneBar: Record<typeof tone, string> = {
    brand: "bg-brand",
    violet: "bg-violet",
    amber: "bg-amber",
  };
  const toneText: Record<typeof tone, string> = {
    brand: "text-brand",
    violet: "text-violet",
    amber: "text-amber",
  };
  return (
    <div className="bg-bg-1 rounded-lg p-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-11 font-semibold tracking-wide-4 uppercase text-ink-2">
          {label}
        </span>
        <span className={`font-mono text-11 font-semibold ${toneText[tone]}`}>
          {percent}%
        </span>
      </div>
      <div className="h-1.5 bg-bg-2 rounded-sm overflow-hidden">
        <div
          className={`h-full ${toneBar[tone]} transition-all duration-200`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 text-10.5 font-mono text-ink-3">
        {covered} / {total}
      </div>
    </div>
  );
}

function PlaybookRow({
  pb,
  expanded,
  onToggle,
}: {
  pb: PlaybookSatisfaction;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusStyle: Record<PlaybookSatisfaction["status"], string> = {
    satisfied: "bg-green-dim text-green",
    partial: "bg-amber-dim text-amber",
    unmet: "bg-red-dim text-red",
  };
  const statusLabel: Record<PlaybookSatisfaction["status"], string> = {
    satisfied: "Satisfied",
    partial: "Partial",
    unmet: "Unmet",
  };

  return (
    <div className="border border-hair-2 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-bg-1 transition-colors"
      >
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-10.5 font-semibold tracking-wide-2 ${statusStyle[pb.status]}`}
        >
          {statusLabel[pb.status]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-12.5 font-medium text-ink-0 truncate">{pb.playbookName}</div>
          <div className="text-11 text-ink-2 truncate">{pb.summary}</div>
        </div>
        <div className="font-mono text-11 text-ink-2 whitespace-nowrap">
          <span className="text-ink-0 font-semibold">{pb.satisfactionPercent}%</span>
          {pb.slaHours && <span className="ml-2 text-ink-3">SLA {pb.slaHours}h</span>}
        </div>
        <span className="text-ink-3 text-[11px]">{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-bg-0">
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <CovCell label="Skills" covered={pb.coveredSkills} total={pb.requiredSkills} />
            <CovCell label="Reasoning" covered={pb.coveredReasoning} total={pb.requiredReasoning} />
            <CovCell label="Analysis" covered={pb.coveredAnalysis} total={pb.requiredAnalysis} />
            <CovCell label="Anchors" covered={pb.coveredAnchors} total={pb.requiredAnchors} />
          </div>
          {pb.missingSkills.length + pb.missingReasoning.length + pb.missingAnalysis.length > 0 && (
            <div className="mt-3">
              <div className="text-10.5 font-semibold tracking-wide-4 uppercase text-ink-2 mb-1.5">
                Missing entries
              </div>
              <div className="flex flex-wrap gap-1">
                {pb.missingSkills.map((id) => (
                  <MissingChip key={id} id={id} category="skills" />
                ))}
                {pb.missingReasoning.map((id) => (
                  <MissingChip key={id} id={id} category="reasoning" />
                ))}
                {pb.missingAnalysis.map((id) => (
                  <MissingChip key={id} id={id} category="analysis" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CovCell({ label, covered, total }: { label: string; covered: number; total: number }) {
  const p = total === 0 ? 100 : Math.round((covered / total) * 100);
  return (
    <div className="bg-bg-panel rounded p-2 border border-hair">
      <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-0.5">{label}</div>
      <div className="font-mono text-12 text-ink-0">
        <span className={p === 100 ? "text-green font-semibold" : p > 0 ? "text-amber" : "text-red"}>
          {covered}
        </span>
        <span className="text-ink-3"> / {total}</span>
      </div>
    </div>
  );
}

function MissingChip({
  id,
  category,
}: {
  id: string;
  category: "skills" | "reasoning" | "analysis";
}) {
  const label = id.replace(/^[a-z]+-/, "").replace(/-/g, " ");
  const tone = category === "skills" ? "bg-brand-dim text-brand-deep" : category === "reasoning" ? "bg-violet-dim text-violet" : "bg-amber-dim text-amber";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-sm text-10.5 font-mono tracking-wide-2 ${tone}`}>
      {label}
    </span>
  );
}
