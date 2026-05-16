// GET /api/agent/stream-screen?subject=...
//
// Live verdict streaming via Server-Sent Events (audit follow-up #32).
// Streams each phase of the screening pipeline as it fires:
//   · phase: 'screen' — quickScreen result
//   · phase: 'pep'    — PEP classification (if roleText supplied)
//   · phase: 'redlines' — redlines fired
//   · phase: 'cross_regime' — cross-regime conflict report
//   · phase: 'verdict' — final composite verdict
//
// Uses the deterministic in-process pipeline; not LLM-streaming.

import { quickScreen } from "../../../../../dist/src/brain/quick-screen.js";
import { evaluateRedlines } from "../../../../../dist/src/brain/redlines.js";
import { detectCrossRegimeConflict, type RegimeStatus } from "../../../../../dist/src/brain/cross-regime-conflict.js";
import { classifyPepRole } from "../../../../../dist/src/brain/pep-classifier.js";
import { loadCandidates } from "@/lib/server/candidates-loader";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StreamSubject {
  name: string;
  type?: string;
  jurisdiction?: string;
  aliases?: string[];
  roleText?: string;
}

function sse(data: unknown, event = "message"): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (!name) return new Response("name query param required", { status: 400, headers: gate.headers });
  const subject: StreamSubject = {
    name,
    type: url.searchParams.get("type") ?? undefined,
    jurisdiction: url.searchParams.get("jurisdiction") ?? undefined,
    roleText: url.searchParams.get("roleText") ?? undefined,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: unknown, event = "message"): void => {
        controller.enqueue(enc.encode(sse(data, event)));
      };

      try {
        send({ at: new Date().toISOString(), phase: "started", subject }, "phase");

        // Phase 1 — quickScreen
        const candidates = await loadCandidates();
        const screen = quickScreen({ name: subject.name, ...(subject.type ? { entityType: subject.type as never } : {}) }, candidates) as {
          topScore?: number; severity?: string; hits?: Array<{ score: number; listId: string; listRef: string }>; generatedAt?: string;
        };
        send({ phase: "screen", topScore: screen.topScore, severity: screen.severity, hitCount: screen.hits?.length ?? 0 }, "phase");

        // Phase 2 — PEP (if role)
        if (subject.roleText) {
          const pep = classifyPepRole(subject.roleText);
          send({ phase: "pep", pep }, "phase");
        }

        // Phase 4 — cross-regime (build hitsByList first; Phase 3 redlines need it)
        const REGIMES = ["un_consolidated", "ofac_sdn", "eu_consolidated", "uk_ofsi", "uae_eocn", "uae_local_terrorist"] as const;
        const hitsByList = new Map<string, typeof screen.hits>();
        for (const h of screen.hits ?? []) {
          const arr = hitsByList.get(h.listId);
          if (arr) arr.push(h); else hitsByList.set(h.listId, [h]);
        }

        // Phase 3 — redlines (IDs derived from confirmed screening hits; score is 0-1 scale)
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
        const redlines = evaluateRedlines(firedRedlineIds);
        send({ phase: "redlines", fired: redlines.fired.map((r: { id: string }) => r.id), action: redlines.action }, "phase");
        const statuses: RegimeStatus[] = REGIMES.map((listId) => {
          const list = hitsByList.get(listId);
          let hit: RegimeStatus["hit"] = "not_designated";
          if (list && list.length > 0) {
            const best = list.reduce((a, b) => (b.score > a.score ? b : a));
            hit = best.score >= 0.85 ? "designated" : "partial_match";
          }
          return { regimeId: listId, hit, asOf: screen.generatedAt ?? new Date().toISOString() };
        });
        const crossRegime = detectCrossRegimeConflict(statuses);
        send({ phase: "cross_regime", recommendedAction: crossRegime.recommendedAction, split: crossRegime.split, unanimous: crossRegime.unanimousDesignated }, "phase");

        // Phase 5 — composite
        const composite = (screen.topScore ?? 0) + redlines.fired.length * 10 + (crossRegime.unanimousDesignated ? 50 : crossRegime.split ? 20 : 0);
        send({ phase: "verdict", compositeScore: Math.min(100, composite), severity: screen.severity, recommendedAction: crossRegime.recommendedAction }, "phase");

        send({ phase: "done", at: new Date().toISOString() }, "phase");
        controller.close();
      } catch (err) {
        send({ phase: "error", message: err instanceof Error ? err.message : String(err) }, "error");
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      ...gate.headers,
    },
  });
}
