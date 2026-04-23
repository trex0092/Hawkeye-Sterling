import { NextResponse } from "next/server";
// Import from the concrete module, not the index barrel — see super-brain
// route for why pulling in the 80-module barrel at cold-start kills these
// Netlify Functions with 502s.
import { quickScreen } from "../../../../../dist/src/brain/quick-screen.js";
import { CANDIDATES } from "@/lib/data/candidates";
import { getJson, listKeys, setJson } from "@/lib/server/store";
import { postWebhook } from "@/lib/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EnrolledSubject {
  id: string;
  name: string;
  aliases?: string[];
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  group?: string;
  caseId?: string;
  enrolledAt: string;
}

interface LastHit {
  listRef: string;
  candidateName: string;
  score: number;
}

interface LastSnapshot {
  runAt: string;
  topScore: number;
  severity: string;
  hits: LastHit[];
}

interface Schedule {
  subjectId: string;
  cadence: "hourly" | "daily" | "weekly" | "monthly";
  scoreThreshold?: number;
  nextRunAt: string;
  lastRunAt?: string;
}

const CADENCE_MS = {
  hourly: 60 * 60 * 1_000,
  daily: 24 * 60 * 60 * 1_000,
  weekly: 7 * 24 * 60 * 60 * 1_000,
  monthly: 30 * 24 * 60 * 60 * 1_000,
};

// Threshold at which a score increase between runs is considered an
// automatic escalation. 15 / 100 points (= 0.15 in normalised terms)
// is large enough to clear noise from feedback-loop rescoring but
// small enough to catch a subject moving from "possible" to "strong".
const ESCALATION_DELTA = 15;

function fingerprints(hits: LastHit[]): Set<string> {
  return new Set(hits.map((h) => `${h.listRef}|${h.candidateName}`));
}

export async function POST(req: Request): Promise<NextResponse> {
  // Bearer token protection. If ONGOING_RUN_TOKEN is not configured the
  // endpoint is locked down entirely — a missing env var must not silently
  // make this a public endpoint (Netlify cron jobs always inject the token).
  const expected = process.env["ONGOING_RUN_TOKEN"];
  if (!expected) {
    return NextResponse.json({ ok: false, error: "service unavailable" }, { status: 503 });
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  // Timing-safe comparison — use TextEncoder for Uint8Array compatibility.
  // Pad `got` to the expected length so timingSafeEqual always compares the
  // same byte count; the length check ensures a shorter token still fails.
  const { timingSafeEqual } = await import("crypto");
  const enc = new TextEncoder();
  const expBuf = enc.encode(expected);
  const gotRaw = enc.encode(got);
  const gotBuf = new Uint8Array(expBuf.length); // zero-padded
  gotBuf.set(gotRaw.slice(0, expBuf.length));
  if (got.length !== expected.length || !timingSafeEqual(expBuf, gotBuf)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const keys = await listKeys("ongoing/subject/");
  // Load subjects in parallel — sequential awaits would time out for large portfolios.
  const loadedSubjects = await Promise.all(keys.map((key) => getJson<EnrolledSubject>(key)));
  const subjects: EnrolledSubject[] = loadedSubjects.filter((s): s is EnrolledSubject => s !== null);

  const runAt = new Date().toISOString();
  const results: Array<{
    subjectId: string;
    subjectName: string;
    topScore: number;
    severity: string;
    scoreDelta: number;
    escalated: boolean;
    newHits: Array<{ listId: string; listRef: string; candidateName: string }>;
    webhook: Awaited<ReturnType<typeof postWebhook>>;
    asanaTaskUrl?: string;
    escalationTaskUrl?: string;
  }> = [];

  const nowMs = Date.now();

  for (const s of subjects) {
    try {
      // Respect per-subject schedule. If a schedule exists and the next
      // run isn't due yet, skip this subject. Subjects without a
      // schedule run on every tick (legacy behaviour).
      const schedule = await getJson<Schedule>(`schedule/${s.id}`);
      if (schedule && Date.parse(schedule.nextRunAt) > nowMs) {
        continue;
      }

      const subject = {
        name: s.name,
        ...(s.aliases && s.aliases.length ? { aliases: s.aliases } : {}),
        ...(s.entityType ? { entityType: s.entityType } : {}),
        ...(s.jurisdiction ? { jurisdiction: s.jurisdiction } : {}),
      };
      const screen = quickScreen(
        subject,
        CANDIDATES as Parameters<typeof quickScreen>[1],
      );
      const prev = await getJson<LastSnapshot>(`ongoing/last/${s.id}`);
      const prevFps = prev ? fingerprints(prev.hits) : new Set<string>();
      const newHits = screen.hits.filter(
        (h) => !prevFps.has(`${h.listRef}|${h.candidateName}`),
      );

      // Auto-escalation: if the subject's top score jumped by more than
      // ESCALATION_DELTA between runs, emit a dedicated escalation
      // webhook so the MLRO is paged rather than waiting on the next
      // four-eyes review.
      const scoreDelta = prev ? screen.topScore - prev.topScore : 0;
      const escalated = scoreDelta >= ESCALATION_DELTA;

      // Persist the fresh snapshot.
      const snapshot: LastSnapshot = {
        runAt,
        topScore: screen.topScore,
        severity: screen.severity,
        hits: screen.hits.map((h) => ({
          listRef: h.listRef,
          candidateName: h.candidateName,
          score: h.score,
        })),
      };
      await setJson(`ongoing/last/${s.id}`, snapshot);

      let asanaTaskUrl: string | undefined;
      // Post a delta task to Asana ONLY when something new appears — avoids
      // flooding the board on every rerun.
      if (newHits.length > 0) {
        try {
          // Use an explicit, env-configured base URL rather than req.url to
          // prevent SSRF via attacker-controlled Host headers.
          const appBase = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
          const asanaRes = await fetch(
            new URL("/api/screening-report", appBase).toString(),
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                subject: {
                  id: s.id,
                  name: s.name,
                  aliases: s.aliases,
                  entityType: s.entityType,
                  jurisdiction: s.jurisdiction,
                  group: s.group,
                  caseId: s.caseId,
                  ongoingScreening: true,
                },
                result: { ...screen, hits: newHits },
                trigger: "ongoing",
              }),
            },
          );
          const payload = (await asanaRes.json().catch(() => null)) as
            | { taskUrl?: string }
            | null;
          if (payload?.taskUrl) asanaTaskUrl = payload.taskUrl;
        } catch {
          /* continue without Asana */
        }
      }

      // Auto-escalation: also drop a task on the escalations board so the
      // MLRO sees the jump immediately. Independent of the delta task —
      // an escalation can fire without new hits (e.g. reinforced score
      // on existing hits) and both boards need to carry the signal.
      let escalationTaskUrl: string | undefined;
      const escalationsProject = process.env["ASANA_ESCALATIONS_PROJECT_GID"];
      const asanaToken = process.env["ASANA_TOKEN"];
      if (escalated && escalationsProject && asanaToken) {
        try {
          const body = {
            data: {
              name: `🚨 Score jumped +${scoreDelta} — ${s.name} (${s.id})`,
              notes: [
                `Subject: ${s.name} (${s.id})`,
                `Jurisdiction: ${s.jurisdiction ?? "—"}`,
                `Previous top score: ${prev?.topScore ?? "n/a"}`,
                `New top score: ${screen.topScore}`,
                `Delta: +${scoreDelta} (threshold ≥ ${ESCALATION_DELTA})`,
                `Severity: ${screen.severity}`,
                `New hits: ${newHits.length}`,
                `Triggered at: ${runAt}`,
              ].join("\n"),
              projects: [escalationsProject],
              workspace: process.env["ASANA_WORKSPACE_GID"] ?? "1213645083721316",
              assignee: process.env["ASANA_ASSIGNEE_GID"] ?? "1213645083721304",
            },
          };
          const r = await fetch("https://app.asana.com/api/1.0/tasks", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${asanaToken}`,
            },
            body: JSON.stringify(body),
          });
          const data = (await r.json().catch(() => null)) as
            | { data?: { gid?: string; permalink_url?: string } }
            | null;
          if (data?.data?.permalink_url) {
            escalationTaskUrl = data.data.permalink_url;
          }
        } catch {
          /* continue without escalation task */
        }
      }

      const webhookType: "screening.escalated" | "screening.delta" | "ongoing.rerun" =
        escalated
          ? "screening.escalated"
          : newHits.length > 0
            ? "screening.delta"
            : "ongoing.rerun";

      const webhook = await postWebhook({
        type: webhookType,
        subjectId: s.id,
        subjectName: s.name,
        severity: screen.severity,
        topScore: screen.topScore,
        scoreDelta,
        escalated,
        newHits: newHits.map((h) => ({
          listId: h.listId,
          listRef: h.listRef,
          candidateName: h.candidateName,
        })),
        ...(asanaTaskUrl ? { asanaTaskUrl } : {}),
        generatedAt: runAt,
        source: "hawkeye-sterling",
      });

      // Advance the schedule clock.
      if (schedule) {
        const advance = CADENCE_MS[schedule.cadence];
        const next: Schedule = {
          ...schedule,
          lastRunAt: runAt,
          nextRunAt: new Date(nowMs + advance).toISOString(),
        };
        await setJson(`schedule/${s.id}`, next);
      }

      results.push({
        subjectId: s.id,
        subjectName: s.name,
        topScore: screen.topScore,
        severity: screen.severity,
        scoreDelta,
        escalated,
        newHits: newHits.map((h) => ({
          listId: h.listId,
          listRef: h.listRef,
          candidateName: h.candidateName,
        })),
        webhook,
        ...(asanaTaskUrl ? { asanaTaskUrl } : {}),
        ...(escalationTaskUrl ? { escalationTaskUrl } : {}),
      });
    } catch (err) {
      results.push({
        subjectId: s.id,
        subjectName: s.name,
        topScore: 0,
        severity: "error",
        scoreDelta: 0,
        escalated: false,
        newHits: [],
        webhook: {
          delivered: false,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    runAt,
    total: subjects.length,
    rescreened: results.length,
    withNewHits: results.filter((r) => r.newHits.length > 0).length,
    escalations: results.filter((r) => r.escalated).length,
    results,
  });
}
