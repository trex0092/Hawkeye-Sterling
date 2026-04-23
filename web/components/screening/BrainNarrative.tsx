"use client";

import { useMemo, useState } from "react";
import type { SuperBrainResult } from "@/lib/hooks/useSuperBrain";

interface BrainNarrativeProps {
  result: SuperBrainResult;
  subjectName: string;
  subjectId: string;
}

// Pure, deterministic narrative synthesis from the super-brain result.
// No LLM, no non-determinism — the same input always produces the same
// narrative so the audit chain stays reproducible. Every claim cites a
// specific field from the brain payload; nothing is fabricated.
function buildNarrative(r: SuperBrainResult, name: string, id: string): string[] {
  const paragraphs: string[] = [];
  const composite = r.composite.score;
  const severity = r.screen.severity.toUpperCase();
  const listsHit = Array.from(new Set(r.screen.hits.map((h) => h.listId)));
  const pepTier = r.pep && r.pep.salience > 0 ? r.pep.tier : null;
  const pepAssessmentTier = r.pepAssessment?.isLikelyPEP
    ? r.pepAssessment.highestTier
    : null;
  const amLabels = r.adverseMedia.map((am) => am.categoryId.replace(/_/g, " "));
  const redlines = r.redlines.fired.map((f) => f.label ?? f.id).filter(Boolean);
  const typologies = r.typologies?.hits.map((t) => t.name) ?? [];
  const jurisdiction = r.jurisdiction;
  const jRich = r.jurisdictionRich;

  // Opening: what the brain actually did.
  paragraphs.push(
    `${name} (${id}) was screened by the Hawkeye Sterling brain across ${r.screen.listsChecked} sanctions / watchlist corpora against ${r.screen.candidatesChecked.toLocaleString()} candidates in ${r.screen.durationMs} ms, returning a composite risk score of ${composite}/100 (severity ${severity}).`,
  );

  // Sanctions verdict.
  if (r.screen.hits.length > 0) {
    const topHit = r.screen.hits[0]!;
    paragraphs.push(
      `The subject matched ${r.screen.hits.length} sanction hit${r.screen.hits.length === 1 ? "" : "s"} across ${listsHit.length} list${listsHit.length === 1 ? "" : "s"} (${listsHit.join(", ")}); the strongest match is "${topHit.candidateName}" at ${Math.round(topHit.score * 100)}% confidence via ${topHit.method}. Immediate MLRO review is required.`,
    );
  } else {
    paragraphs.push(
      `No sanctions-list hits were returned above the 82% confidence threshold across any screened corpus.`,
    );
  }

  // PEP verdict.
  if (pepTier || pepAssessmentTier) {
    const t = pepTier ?? pepAssessmentTier;
    const saliencePct = r.pep ? Math.round(r.pep.salience * 100) : null;
    paragraphs.push(
      `Subject classified as PEP ${t}${saliencePct != null ? ` with ${saliencePct}% salience` : ""}${r.pep?.rationale ? ` — ${r.pep.rationale}` : ""}. Enhanced due-diligence (EDD) applies under FATF Recommendation 12 / FDL 10/2025 Art.17.`,
    );
  } else {
    paragraphs.push(`No PEP classification was raised by the brain on this screen.`);
  }

  // Adverse media + ESG.
  if (amLabels.length > 0 || (r.esg && r.esg.length > 0)) {
    const bits: string[] = [];
    if (amLabels.length > 0) {
      bits.push(
        `adverse-media signals fired on ${amLabels.length} categor${amLabels.length === 1 ? "y" : "ies"} (${amLabels.join("; ")})`,
      );
    }
    if (r.esg && r.esg.length > 0) {
      bits.push(
        `ESG overlay matched ${r.esg.length} categor${r.esg.length === 1 ? "y" : "ies"} across SASB / EU-Taxonomy / SDG frameworks`,
      );
    }
    paragraphs.push(
      `Open-source analysis: ${bits.join("; ")}. These signals require analyst corroboration before constructive-knowledge can be asserted under FDL 10/2025 Art.2(3).`,
    );
  } else {
    paragraphs.push(`No adverse-media or ESG signals fired on this tick.`);
  }

  // Jurisdiction.
  if (jurisdiction) {
    const cahra = jurisdiction.cahra;
    const regimes = jurisdiction.regimes.length > 0 ? ` Active regimes: ${jurisdiction.regimes.join(", ")}.` : "";
    const tierText = jRich?.tiers?.length
      ? ` FATF tiers: ${jRich.tiers.slice(0, 3).join(", ")}.`
      : "";
    paragraphs.push(
      `Jurisdiction ${jurisdiction.name} (${jurisdiction.iso2}) is${cahra ? " on the UAE CAHRA register" : " not CAHRA-listed"}.${regimes}${tierText}`,
    );
  }

  // Redlines + typologies.
  if (redlines.length > 0 || typologies.length > 0) {
    const bits: string[] = [];
    if (redlines.length > 0) {
      bits.push(
        `charter redlines fired (${redlines.slice(0, 4).join(", ")})`,
      );
    }
    if (typologies.length > 0) {
      bits.push(
        `typologies matched (${typologies.slice(0, 4).join(", ")})`,
      );
    }
    paragraphs.push(
      `Policy signals: ${bits.join("; ")}${r.redlines.action ? ` — action: ${r.redlines.action}` : ""}.`,
    );
  }

  // Recommendation.
  const rec = (() => {
    if (r.screen.hits.length > 0 && severity === "CRITICAL") {
      return "FREEZE relationship, file FFR + parallel SAR via goAML within 5 business days, notify EOCN + MoE, escalate to CEO and Board Chair.";
    }
    if (r.screen.hits.length > 0 || severity === "HIGH") {
      return "Escalate to MLRO for enhanced due diligence; defer clearance pending analyst review of source-of-wealth / source-of-funds.";
    }
    if (pepTier || pepAssessmentTier) {
      return "Apply EDD and obtain senior-management approval; enrol in thrice-daily ongoing monitoring.";
    }
    if (amLabels.length > 0 || redlines.length > 0) {
      return "Defer clearance pending analyst review and live-news corroboration; enrol in ongoing monitoring.";
    }
    return "Proceed with standard CDD; enrol in ongoing monitoring at thrice_daily cadence (08:30 / 15:00 / 17:30 Dubai).";
  })();
  paragraphs.push(`Recommendation: ${rec}`);

  return paragraphs;
}

export function BrainNarrative({
  result,
  subjectName,
  subjectId,
}: BrainNarrativeProps) {
  const paragraphs = useMemo(
    () => buildNarrative(result, subjectName, subjectId),
    [result, subjectName, subjectId],
  );
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(paragraphs.join("\n\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable (insecure context / blocked) */
    }
  };

  return (
    <div className="bg-gradient-to-br from-ink-0 to-ink-1 text-white rounded-lg p-4 mb-3 border border-brand/30">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-10 font-semibold tracking-wide-2 bg-brand text-white uppercase">
            Brain narrative
          </span>
          <span className="text-10.5 text-white/60 font-mono">
            auto-generated · deterministic · audit-safe
          </span>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="text-10.5 font-mono px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Copy to clipboard"
          >
            {copied ? "✓ copied" : "copy"}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-10.5 font-mono px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label={expanded ? "Collapse narrative" : "Expand narrative"}
          >
            {expanded ? "−" : "+"}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="space-y-2 text-12 leading-relaxed text-white/95">
          {paragraphs.map((p, i) => (
            <p key={i} className="m-0">
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
