// POST /api/screen/batch — lightweight batch screening endpoint.
//
// Designed for programmatic callers and regulator-portal integrations
// that need to screen a small set of subjects in a single request.
// Hard cap: 20 subjects per call (use /api/batch-screen for larger jobs).
// Dedup guard: rejects batches containing duplicate subject names
// (case-insensitive, whitespace-normalised) — prevents re-screening the
// same entity twice in a single call, which wastes quota and inflates
// match counts in audit logs.
//
// Auth: enforce() — supports both Bearer ADMIN_TOKEN and API-key auth.
// maxDuration: 60 s.
//
// Request body:
//   {
//     subjects: [
//       {
//         name: string,                     // required
//         aliases?: string[],
//         entityType?: "individual" | "organisation" | "vessel",
//         jurisdiction?: string,
//         dob?: string,                     // ISO date
//       }
//     ],
//     options?: {
//       threshold?: number,                 // 0–100, default 70
//       includeAdverseMedia?: boolean,      // default false — adds latency
//     }
//   }
//
// Response:
//   {
//     ok: true,
//     count: number,
//     requestId: string,
//     screenedAt: string,
//     results: [
//       {
//         name: string,
//         entityType: string,
//         topScore: number,
//         band: "critical" | "high" | "medium" | "low" | "clear",
//         hitCount: number,
//         recommendation: "match" | "review" | "dismiss",
//         lists: string[],               // list IDs with hits
//         topHitName?: string,           // name of highest-scoring hit
//       }
//     ]
//   }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { loadCandidates } from "@/lib/server/candidates-loader";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import type {
  QuickScreenCandidate,
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH_SIZE = 20;

type EntityType = "individual" | "organisation" | "vessel" | "aircraft" | "other";

interface SubjectInput {
  name: string;
  aliases?: string[];
  entityType?: EntityType;
  jurisdiction?: string;
  dob?: string;
}

interface BatchOptions {
  threshold?: number;
  includeAdverseMedia?: boolean;
}

interface Body {
  subjects: SubjectInput[];
  options?: BatchOptions;
}

interface ScreenResult {
  name: string;
  entityType: EntityType;
  topScore: number;
  band: string;
  hitCount: number;
  recommendation: "match" | "review" | "dismiss";
  lists: string[];
  topHitName?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normaliseSubjectName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreToBand(score: number): string {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  if (score >= 25) return "low";
  return "clear";
}

function scoreToRecommendation(score: number): "match" | "review" | "dismiss" {
  if (score >= 70) return "match";
  if (score >= 35) return "review";
  return "dismiss";
}

function parseBody(raw: unknown): Body | null {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw["subjects"])) return null;
  const subjects: SubjectInput[] = [];
  for (const item of raw["subjects"]) {
    if (!isRecord(item) || typeof item["name"] !== "string" || !item["name"].trim()) return null;
    subjects.push({
      name: item["name"].trim(),
      aliases: Array.isArray(item["aliases"])
        ? (item["aliases"] as unknown[]).filter((a): a is string => typeof a === "string" && !!a.trim())
        : undefined,
      entityType: (["individual", "organisation", "vessel", "aircraft", "other"] as EntityType[]).includes(
        item["entityType"] as EntityType,
      )
        ? (item["entityType"] as EntityType)
        : undefined,
      jurisdiction: typeof item["jurisdiction"] === "string" ? item["jurisdiction"].trim() : undefined,
      dob: typeof item["dob"] === "string" ? item["dob"].trim() : undefined,
    });
  }
  const opts = isRecord(raw["options"]) ? raw["options"] : {};
  return {
    subjects,
    options: {
      threshold: typeof opts["threshold"] === "number" ? Math.max(0, Math.min(100, opts["threshold"])) : 70,
      includeAdverseMedia: opts["includeAdverseMedia"] === true,
    },
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_body",
        hint: "subjects must be a non-empty array of objects with a name field",
      },
      { status: 400 },
    );
  }

  // Hard cap.
  if (body.subjects.length === 0) {
    return NextResponse.json({ ok: false, error: "subjects array is empty" }, { status: 400 });
  }
  if (body.subjects.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      {
        ok: false,
        error: "batch_too_large",
        hint: `Maximum ${MAX_BATCH_SIZE} subjects per request. Use /api/batch-screen for larger batches.`,
        received: body.subjects.length,
        limit: MAX_BATCH_SIZE,
      },
      { status: 400 },
    );
  }

  // Dedup guard — reject batches with duplicate names (case-insensitive).
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const s of body.subjects) {
    const key = normaliseSubjectName(s.name);
    if (seen.has(key)) duplicates.push(s.name);
    seen.add(key);
  }
  if (duplicates.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "duplicate_subjects",
        hint: "Each subject name must be unique within the batch (case-insensitive). Remove duplicates and retry.",
        duplicates,
      },
      { status: 400 },
    );
  }

  const threshold = body.options?.threshold ?? 70;
  const requestId = `sbatch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const screenedAt = new Date().toISOString();

  // Load candidates corpus once.
  let candidates: QuickScreenCandidate[];
  try {
    candidates = (await loadCandidates()) as QuickScreenCandidate[];
  } catch {
    return NextResponse.json(
      { ok: false, error: "screening_corpus_unavailable" },
      { status: 503 },
    );
  }

  type QuickScreenFn = (subject: QuickScreenSubject, candidates: QuickScreenCandidate[]) => QuickScreenResult;

  // Dynamic import of quickScreen to avoid cold-start barrel overhead.
  let quickScreen: QuickScreenFn;

  try {
    const mod = (await import("../../../../../dist/src/brain/quick-screen.js")) as {
      quickScreen: QuickScreenFn;
    };
    quickScreen = mod.quickScreen;
  } catch {
    return NextResponse.json(
      { ok: false, error: "screening_engine_unavailable" },
      { status: 503 },
    );
  }

  const results: ScreenResult[] = [];

  for (const subject of body.subjects) {
    try {
      const raw = quickScreen(
        {
          name: subject.name,
          aliases: subject.aliases,
          entityType: subject.entityType,
          dob: subject.dob,
        } as QuickScreenSubject,
        candidates,
      );

      const topScore = (raw as { topScore?: number }).topScore ?? 0;
      type HitLike = { score?: number; listId?: string; name?: string };
      const hits = ((raw as { results?: HitLike[] }).results ?? []).filter((r) => (r.score ?? 0) >= threshold);
      const listIds = [...new Set(hits.map((h) => h.listId ?? "unknown").filter(Boolean))];
      const topHit = hits.reduce<HitLike | null>(
        (best, h) => (!best || (h.score ?? 0) > (best.score ?? 0) ? h : best),
        null,
      );

      results.push({
        name: subject.name,
        entityType: subject.entityType ?? "individual",
        topScore,
        band: scoreToBand(topScore),
        hitCount: hits.length,
        recommendation: scoreToRecommendation(topScore),
        lists: listIds,
        ...(topHit?.name ? { topHitName: topHit.name } : {}),
      });
    } catch {
      results.push({
        name: subject.name,
        entityType: subject.entityType ?? "individual",
        topScore: 0,
        band: "clear",
        hitCount: 0,
        recommendation: "dismiss",
        lists: [],
      });
    }
  }

  // Write audit entry — fire-and-forget.
  const elevated = results.filter((r) => r.topScore >= 70);
  void writeAuditChainEntry({
    event: "batch_screen.completed",
    actor: "api",
    requestId,
    subjectCount: body.subjects.length,
    elevatedCount: elevated.length,
    topScore: Math.max(...results.map((r) => r.topScore), 0),
  });

  return NextResponse.json({
    ok: true,
    requestId,
    screenedAt,
    count: results.length,
    elevatedCount: elevated.length,
    results,
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
