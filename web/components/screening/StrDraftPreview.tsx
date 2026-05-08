"use client";

// Hawkeye Sterling — STR draft preview (audit follow-up #33).
//
// Renders a goAML-shaped Suspicious Transaction Report draft that the
// MLRO can review BEFORE filing. Pulls from the BrainVerdict + super-
// brain output — no fields invented, every section cites the
// underlying mode/anchor (Charter P2 + P9). The component is read-
// only; submission to goAML is a separate (deferred) integration.

import { useState } from "react";

interface FindingLike {
  modeId: string;
  rationale?: string;
  score?: number;
}

interface StrDraftSource {
  caseId: string;
  runId: string;
  subject: { name: string; type?: string; jurisdiction?: string; identifiers?: Record<string, string> };
  outcome: string;
  aggregateScore?: number;
  posterior?: number;
  findings?: FindingLike[];
  redlines?: { fired?: Array<{ id?: string; label?: string; regulatoryAnchor?: string }> };
  crossRegimeConflict?: { unanimousDesignated?: boolean; split?: boolean; recommendedAction?: string };
  evidenceCorroboration?: { score?: number; reasons?: string[] };
  jurisdiction?: { iso2?: string; name?: string; cahra?: boolean };
}

interface Props {
  source: StrDraftSource;
  reporterEntity?: { name: string; tradeLicense?: string; mlro?: string };
}

export function StrDraftPreview({ source, reporterEntity }: Props): JSX.Element {
  const [showRaw, setShowRaw] = useState(false);
  const draft = buildDraft(source, reporterEntity);

  return (
    <div className="rounded-md border border-zinc-300 bg-white text-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-600">STR draft preview</div>
          <div className="text-sm font-medium text-zinc-900">goAML XML envelope (preview only — not filed)</div>
        </div>
        <button
          type="button"
          onClick={() => setShowRaw((x) => !x)}
          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-100"
        >
          {showRaw ? "structured view" : "raw XML"}
        </button>
      </div>

      <div className="p-3 text-xs text-zinc-900">
        {showRaw ? (
          <pre className="overflow-x-auto rounded bg-zinc-100 p-2 text-[11px] leading-snug text-zinc-900">
            {draft.xml}
          </pre>
        ) : (
          <dl className="space-y-2">
            <Row label="Reporting entity" value={`${draft.reporter.name}${draft.reporter.tradeLicense ? ` · TL ${draft.reporter.tradeLicense}` : ""}`} />
            <Row label="MLRO" value={draft.reporter.mlro ?? "—"} />
            <Row label="Subject" value={`${source.subject.name}${source.subject.type ? ` (${source.subject.type})` : ""}`} />
            <Row label="Identifiers" value={Object.entries(source.subject.identifiers ?? {}).map(([k, v]) => `${k}=${v}`).join(", ") || "—"} />
            <Row label="Jurisdiction" value={`${source.jurisdiction?.name ?? source.subject.jurisdiction ?? "—"}${source.jurisdiction?.cahra ? " · CAHRA" : ""}`} />
            <Row label="Verdict outcome" value={source.outcome} mono />
            <Row label="Composite score" value={source.aggregateScore !== undefined ? source.aggregateScore.toFixed(3) : "—"} mono />
            <Row label="Posterior" value={source.posterior !== undefined ? source.posterior.toFixed(3) : "—"} mono />
            <Row label="Cross-regime" value={source.crossRegimeConflict?.recommendedAction ?? "n/a"} />
            <Row label="Redlines fired" value={(source.redlines?.fired ?? []).map((r) => r.id ?? r.label ?? "?").join(", ") || "none"} />
            <div>
              <dt className="text-zinc-600 font-medium">Reason for suspicion (auto-drafted)</dt>
              <dd className="mt-1 whitespace-pre-wrap rounded bg-zinc-100 p-2 text-[11px] text-zinc-900">{draft.reasonForSuspicion}</dd>
            </div>
            <div>
              <dt className="text-zinc-600 font-medium">Mode citations</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {(source.findings ?? [])
                  .filter((f) => (f.score ?? 0) >= 0.5)
                  .slice(0, 12)
                  .map((f) => (
                    <span key={f.modeId} className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-[10px] text-zinc-900">
                      {f.modeId}
                    </span>
                  ))}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-600 font-medium">Regulatory anchors</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {draft.anchors.map((a) => (
                  <span key={a} className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-900">
                    {a}
                  </span>
                ))}
              </dd>
            </div>
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">
              Charter P2 + P5: every claim above traces back to a brain
              finding or redline. No statement of guilt — observable
              facts + indicators only. Final legal characterisation is
              reserved to the MLRO + FIU.
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }): JSX.Element {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-zinc-600 font-medium">{label}</dt>
      <dd className={mono ? "font-mono text-zinc-900" : "text-zinc-900"}>{value}</dd>
    </div>
  );
}

interface BuiltDraft {
  xml: string;
  reasonForSuspicion: string;
  anchors: string[];
  reporter: { name: string; tradeLicense?: string; mlro?: string };
}

function buildDraft(source: StrDraftSource, reporterEntity?: Props["reporterEntity"]): BuiltDraft {
  const reporter = {
    name: reporterEntity?.name ?? "[Reporting entity]",
    ...(reporterEntity?.tradeLicense ? { tradeLicense: reporterEntity.tradeLicense } : {}),
    ...(reporterEntity?.mlro ? { mlro: reporterEntity.mlro } : {}),
  };

  const reasonLines: string[] = [];
  reasonLines.push(`Subject: ${source.subject.name}.`);
  reasonLines.push(`Outcome: ${source.outcome}; composite score ${source.aggregateScore?.toFixed(3) ?? "—"}.`);
  if (source.crossRegimeConflict?.unanimousDesignated) {
    reasonLines.push("Subject designated unanimously across UN/OFAC/EU/UK/UAE EOCN — TFS freeze obligation engaged.");
  } else if (source.crossRegimeConflict?.split) {
    reasonLines.push("Sanctions regimes split on subject's status — most-restrictive-regime rule applied.");
  }
  if (source.redlines?.fired?.length) {
    reasonLines.push(`Redlines fired: ${source.redlines.fired.map((r) => r.id ?? r.label ?? "?").join(", ")}.`);
  }
  for (const f of (source.findings ?? []).filter((f) => (f.score ?? 0) >= 0.6).slice(0, 5)) {
    if (f.rationale) reasonLines.push(`[${f.modeId}] ${f.rationale}`);
  }
  if (source.evidenceCorroboration?.score !== undefined) {
    reasonLines.push(`Evidence corroboration: ${(source.evidenceCorroboration.score * 100).toFixed(0)}/100.`);
  }

  const anchors = Array.from(
    new Set([
      "FATF R.20 (STR filing)",
      "UAE FDL 10/2025 Art.15",
      "UAE FDL 10/2025 Art.16 (no tipping-off)",
      "Cabinet Decision 74/2020 (TFS)",
      "MoE Circular 3/2025",
      ...(source.redlines?.fired ?? []).map((r) => r.regulatoryAnchor).filter((a): a is string => Boolean(a)),
    ]),
  );

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<report xmlns="http://www.uniteddigital.eu/goaml/Schema-v4">`,
    `  <rentity_id>${escapeXml(reporter.name)}</rentity_id>`,
    `  <submission_code>STR</submission_code>`,
    `  <report_code>STR</report_code>`,
    `  <entity_reference>${escapeXml(source.caseId)}</entity_reference>`,
    `  <submission_date>${new Date().toISOString()}</submission_date>`,
    `  <reason><![CDATA[${reasonLines.join("\n")}]]></reason>`,
    `  <subject>`,
    `    <name>${escapeXml(source.subject.name)}</name>`,
    `    <type>${escapeXml(source.subject.type ?? "individual")}</type>`,
    `  </subject>`,
    `  <regulatoryAnchors>`,
    ...anchors.map((a) => `    <anchor>${escapeXml(a)}</anchor>`),
    `  </regulatoryAnchors>`,
    `  <runRef>${escapeXml(source.runId)}</runRef>`,
    `</report>`,
  ].join("\n");

  return { xml, reasonForSuspicion: reasonLines.join("\n"), anchors, reporter };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default StrDraftPreview;
