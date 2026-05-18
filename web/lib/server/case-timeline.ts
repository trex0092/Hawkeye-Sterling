// Hawkeye Sterling — case-record → brain-timeline translator.
//
// The case record (web/lib/types.ts CaseRecord) carries a thin
// presentation-layer `timeline: TimelineEvent[]` plus structured `evidence`
// and (sometimes) `screeningSnapshot`. The brain ships a richer
// canonical timeline shape in `src/brain/investigation-timeline.ts` with
// phase / actor / sourceKind / sourceId — that's the audit-traceable
// representation we want downstream consumers (UI, exports, regulator
// packs) to use.
//
// This module is the "B" path from the timeline-wiring decision: a thin
// translator at the API boundary. The "A" follow-up (refactor the case
// record to use the brain shape natively) can land in a later PR — this
// one ships the brain timeline alongside the legacy field without
// touching any UI.

import type { CaseRecord } from "@/lib/types";
import {
  buildTimeline,
  type TimelineEvent as BrainTimelineEvent,
  type TimelinePhase,
} from "../../../dist/src/brain/investigation-timeline.js";

const ACTION_PHASE_HINT: Record<string, TimelinePhase> = {
  "subject.added":          "intake",
  "screening.completed":    "screen",
  "case.opened":            "investigate",
  "case.closed":            "disposition",
  "ongoing.enrolled":       "monitor",
  "str.filed":              "filing",
  "sar.filed":              "filing",
  "freeze":                 "freeze",
  "exit":                   "exit",
};

function phaseFromEvent(event: string): TimelinePhase {
  const lower = event.toLowerCase();
  for (const [key, phase] of Object.entries(ACTION_PHASE_HINT)) {
    if (lower.includes(key.replace(".", " "))) return phase;
  }
  if (/intake|onboard|prospect/.test(lower)) return "intake";
  if (/screen|match|hit/.test(lower)) return "screen";
  if (/cdd|kyc|edd/.test(lower)) return "cdd";
  if (/monitor|cadence|rescreen/.test(lower)) return "monitor";
  if (/alert|flag/.test(lower)) return "alert";
  if (/escalat|four[- ]eyes/.test(lower)) return "escalate";
  if (/dispose|verdict|approve|clear|close/.test(lower)) return "disposition";
  if (/file|str|sar|goaml/.test(lower)) return "filing";
  if (/freeze|seize/.test(lower)) return "freeze";
  if (/exit|offboard|terminate/.test(lower)) return "exit";
  if (/audit|review|lookback/.test(lower)) return "audit";
  if (/investigat/.test(lower)) return "investigate";
  return "other";
}

/**
 * Build the canonical brain-shaped investigation timeline from a
 * presentation-layer CaseRecord. This synthesises brain TimelineEvents
 * from the case's evidence list and free-text timeline strip — the case
 * record doesn't carry signed audit-chain entries directly (those live in
 * the Blobs audit chain at /api/audit/sign), so the brain's `audit`
 * channel is left empty here. A richer wire-up (joining audit-chain
 * entries by case-id) can ship in a follow-up PR once the audit chain
 * is indexed by case-id; for now this gives the UI / regulator export a
 * structured timeline that matches the brain's domain model exactly.
 */
export function buildInvestigationTimeline(c: CaseRecord): BrainTimelineEvent[] {
  const notes = (c.timeline ?? []).map((t, i) => ({
    at: t.timestamp,
    actor: "case-system",
    summary: t.event,
    id: `${c.id}-note-${i}`,
  }));

  // Brain.buildTimeline accepts evidence shaped as EvidenceItem[]. The case
  // record's EvidenceEntry is a presentation-only shape (no observedAt,
  // credibility, etc.) — pass nothing for evidence here and surface the
  // case evidence via the notes channel so they still land on the
  // timeline with case-system actor + an inferred phase derived from the
  // category. This keeps the translator pure and avoids inventing fields
  // the brain's evidence credibility scorer doesn't have data for.
  const evidenceNotes = (c.evidence ?? []).map((e, i) => ({
    at: c.opened ?? new Date().toISOString(),
    actor: "case-system",
    summary: `evidence:${e.category} — ${e.title}${e.detail ? ` · ${e.detail.slice(0, 120)}` : ""}`,
    id: `${c.id}-ev-${i}`,
  }));

  const built = buildTimeline({
    notes: [...evidenceNotes, ...notes],
  });

  // Re-tag note phases based on event text since brain treats all notes
  // as 'other'. This restores phase signal so the UI can colour-code.
  return built.map((e: BrainTimelineEvent) =>
    e.sourceKind === "note"
      ? { ...e, phase: phaseFromEvent(e.summary) }
      : e,
  );
}
