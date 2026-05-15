// POST /api/agent/batch-screen
//
// Batch-screening queue (audit follow-up #36). Accepts an array of
// subjects and processes them through the deterministic super-brain
// pipeline (in-process — no LLM round trip per subject) at high
// throughput. For LLM tool-use screening of a batch, use the Anthropic
// Batch API directly against /api/agent/screen — that's a separate
// deferred follow-up.
//
// Charter P9 — every result carries the same auditable verdict shape
// as a single screen.
//
// Body: { subjects: Array<{ name, type?, jurisdiction?, ... }>, mode?: 'fast'|'full' }
// Response: { ok, results: Array<{ subjectIndex, verdict|error }>, totalMs }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { quickScreen } from "../../../../../dist/src/brain/quick-screen.js";
import { evaluateRedlines } from "../../../../../dist/src/brain/redlines.js";
import { detectCrossRegimeConflict, type RegimeStatus } from "../../../../../dist/src/brain/cross-regime-conflict.js";
import { loadCandidates } from "@/lib/server/candidates-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_SUBJECTS_PER_REQUEST = 100;
const PER_SUBJECT_BUDGET_MS = 200;       // soft target; quickScreen is sub-ms typically

interface SubjectInput {
  name: string;
  aliases?: string[];
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
}

interface Body {
  subjects: SubjectInput[];
  mode?: "fast" | "full";
}

interface BatchResult {
  subjectIndex: number;
  ok: boolean;
  subjectName?: string;
  topScore?: number;
  severity?: string;
  hits?: number;
  redlinesFired?: number;
  crossRegime?: { recommendedAction: string; split: boolean } | null;
  durationMs: number;
  error?: string;
}

async function handlePost(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gateHeaders },
    );
  }

  if (!Array.isArray(body?.subjects) || body.subjects.length === 0) {
    return NextResponse.json(
      { ok: false, error: "subjects[] required" },
      { status: 400, headers: gateHeaders },
    );
  }
  if (body.subjects.length > MAX_SUBJECTS_PER_REQUEST) {
    return NextResponse.json(
      { ok: false, error: `cap ${MAX_SUBJECTS_PER_REQUEST} subjects per request — chunk client-side` },
      { status: 413, headers: gateHeaders },
    );
  }

  const startedAt = Date.now();
  const candidates = await loadCandidates();
  const mode = body.mode === "full" ? "full" : "fast";

  // Process all subjects in parallel — quickScreen is CPU-only and
  // synchronous; redlines + cross-regime are also in-process. No I/O per
  // subject, so parallel is safe and eliminates the serial wait.
  const results: BatchResult[] = await Promise.all(
    body.subjects.map(async (sub, i): Promise<BatchResult> => {
      const subStartedAt = Date.now();
      if (!sub?.name || typeof sub.name !== "string" || !sub.name.trim() || sub.name.length > 500) {
        return { subjectIndex: i, ok: false, error: "invalid subject", durationMs: Date.now() - subStartedAt };
      }
      try {
        const screen = quickScreen(sub, candidates) as {
          topScore?: number;
          severity?: string;
          hits?: Array<{ score: number; listId: string; listRef: string }>;
          generatedAt?: string;
        };
        const hits = screen.hits ?? [];

        // Redlines (fast mode skips this; full mode includes).
        let redlinesFiredCount = 0;
        let crossRegime: BatchResult["crossRegime"] = null;
        if (mode === "full") {
          const REGIME_LIST_IDS = ["un_consolidated", "ofac_sdn", "eu_consolidated", "uk_ofsi", "uae_eocn", "uae_local_terrorist"] as const;
          const hitsByList = new Map<string, typeof hits>();
          for (const h of hits) {
            const arr = hitsByList.get(h.listId);
            if (arr) arr.push(h);
            else hitsByList.set(h.listId, [h]);
          }
          // Derive fired redline IDs from confirmed hits (score is 0-1 scale)
          const firedRedlineIds: string[] = [];
          const SANCTIONS_REDLINE_MAP: Array<[string, string]> = [
            ["ofac_sdn", "rl_ofac_sdn_confirmed"],
            ["un_consolidated", "rl_un_consolidated_confirmed"],
            ["eu_consolidated", "rl_eu_cfsp_confirmed"],
            ["uk_ofsi", "rl_uk_ofsi_confirmed"],
          ];
          for (const [lid, rid] of SANCTIONS_REDLINE_MAP) {
            if ((hitsByList.get(lid) ?? []).some((h) => h.score >= 0.85)) firedRedlineIds.push(rid);
          }
          const uaeHits = [...(hitsByList.get("uae_eocn") ?? []), ...(hitsByList.get("uae_local_terrorist") ?? [])];
          if (uaeHits.some((h) => h.score >= 0.85)) firedRedlineIds.push("rl_eocn_confirmed");
          redlinesFiredCount = evaluateRedlines(firedRedlineIds).fired.length;
          const statuses: RegimeStatus[] = REGIME_LIST_IDS.map((listId) => {
            const list = hitsByList.get(listId);
            let hit: RegimeStatus["hit"] = "not_designated";
            if (list && list.length > 0) {
              const best = list.reduce((a, b) => (b.score > a.score ? b : a));
              hit = best.score >= 0.85 ? "designated" : "partial_match";
            }
            return { regimeId: listId, hit, asOf: screen.generatedAt ?? new Date().toISOString() };
          });
          const cr = detectCrossRegimeConflict(statuses);
          crossRegime = { recommendedAction: cr.recommendedAction, split: cr.split };
        }

        return {
          subjectIndex: i,
          ok: true,
          subjectName: sub.name,
          topScore: screen.topScore,
          severity: screen.severity,
          hits: hits.length,
          redlinesFired: redlinesFiredCount,
          crossRegime,
          durationMs: Date.now() - subStartedAt,
        };
      } catch (err) {
        return {
          subjectIndex: i,
          ok: false,
          subjectName: sub.name,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - subStartedAt,
        };
      }
    }),
  );

  return NextResponse.json(
    {
      ok: true,
      mode,
      total: body.subjects.length,
      processed: results.length,
      results,
      totalMs: Date.now() - startedAt,
    },
    { headers: gateHeaders },
  );
}

export const POST = handlePost;
