// A/B harness for matching thresholds. Runs the same subject through
// quickScreen at multiple scoreThreshold values, then reports per-arm
// hit counts + severity distributions so the calibration team can pick
// a defensible cutoff.
//
// Body: { subjects: QuickScreenSubject[], thresholds?: number[] }
// Returns: { arms: Array<{ threshold, totalHits, severityDist, perSubject[] }> }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { loadCandidates } from "@/lib/server/candidates-loader";
import { quickScreen as _quickScreen } from "../../../../dist/src/brain/quick-screen.js";
import type {
  QuickScreenCandidate,
  QuickScreenOptions,
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";

type QuickScreenFn = (
  subject: QuickScreenSubject,
  candidates: QuickScreenCandidate[],
  opts?: QuickScreenOptions,
) => QuickScreenResult;

const quickScreen = _quickScreen as QuickScreenFn;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_THRESHOLDS = [0.7, 0.78, 0.85, 0.9];
const MAX_SUBJECTS = 50;
const MAX_ARMS = 6;

interface SubjectResult {
  name: string;
  topScore: number;
  severity: string;
  hitCount: number;
}

interface Arm {
  threshold: number;
  totalHits: number;
  severityDist: Record<string, number>;
  perSubject: SubjectResult[];
  /** Hits in this arm but NOT in the strictest arm — i.e. items the
   *  threshold lets through that the most-restrictive arm filtered out.
   *  Surfaces the false-positive cost of loosening. */
  falsePositiveProxy: number;
}

interface Body {
  subjects?: QuickScreenSubject[];
  thresholds?: number[];
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const headers: Record<string, string> = gate.ok ? gate.headers : {};

  let body: Body;
  try { body = (await req.json()) as Body; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers });
  }
  const subjects = Array.isArray(body.subjects) ? body.subjects : [];
  if (subjects.length === 0) {
    return NextResponse.json({ ok: false, error: "subjects[] required" }, { status: 400, headers });
  }
  if (subjects.length > MAX_SUBJECTS) {
    return NextResponse.json({ ok: false, error: `subjects exceed ${MAX_SUBJECTS}-row cap` }, { status: 400, headers });
  }
  const thresholds = (Array.isArray(body.thresholds) && body.thresholds.length > 0
    ? body.thresholds
    : DEFAULT_THRESHOLDS)
    .filter((t): t is number => typeof t === "number" && t > 0 && t <= 1)
    .slice(0, MAX_ARMS);
  if (thresholds.length === 0) {
    return NextResponse.json({ ok: false, error: "thresholds must be in (0, 1]" }, { status: 400, headers });
  }

  const candidates = await loadCandidates();
  const arms: Arm[] = thresholds
    .slice()
    .sort((a, b) => a - b)
    .map((threshold) => {
      const severityDist: Record<string, number> = { clear: 0, low: 0, medium: 0, high: 0, critical: 0 };
      const perSubject: SubjectResult[] = [];
      let totalHits = 0;
      for (const s of subjects) {
        if (!s?.name?.trim()) continue;
        try {
          const r = quickScreen(s, candidates, { scoreThreshold: threshold });
          totalHits += r.hits.length;
          severityDist[r.severity] = (severityDist[r.severity] ?? 0) + 1;
          perSubject.push({
            name: s.name,
            topScore: r.topScore,
            severity: r.severity,
            hitCount: r.hits.length,
          });
        } catch (err) {
          perSubject.push({
            name: s.name,
            topScore: 0,
            severity: "error",
            hitCount: 0,
          });
          severityDist["error"] = (severityDist["error"] ?? 0) + 1;
          // Keep going — one bad subject shouldn't fail the whole arm.
          void err;
        }
      }
      return { threshold, totalHits, severityDist, perSubject, falsePositiveProxy: 0 };
    });

  // The strictest arm is the rightmost (highest threshold) — anything
  // it lets through is, by definition, a high-confidence true positive.
  // Hits in looser arms NOT in the strict arm are the FP proxy.
  const strict = arms[arms.length - 1];
  if (strict) {
    const strictHits = new Set(
      strict.perSubject.filter((s) => s.hitCount > 0).map((s) => s.name.toLowerCase()),
    );
    for (const arm of arms) {
      arm.falsePositiveProxy = arm.perSubject.filter(
        (s) => s.hitCount > 0 && !strictHits.has(s.name.toLowerCase()),
      ).length;
    }
  }

  return NextResponse.json(
    { ok: true, subjectCount: subjects.length, arms, generatedAt: new Date().toISOString() },
    { headers },
  );
}
