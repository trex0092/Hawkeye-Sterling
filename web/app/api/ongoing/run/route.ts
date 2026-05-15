import { NextResponse } from "next/server";
// Import from the concrete module, not the index barrel — see super-brain
// route for why pulling in the 80-module barrel at cold-start kills these
// Netlify Functions with 502s.
import { quickScreen as _quickScreen } from "../../../../../dist/src/brain/quick-screen.js";
import { searchAdverseMedia } from "../../../../../dist/src/integrations/taranisAi.js";
import { analyseAdverseMediaItems } from "../../../../../dist/src/brain/adverse-media-analyser.js";
import type {
  QuickScreenCandidate,
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";
import { loadCandidates } from "@/lib/server/candidates-loader";
import { classifyAdverseKeywords } from "@/lib/data/adverse-keywords";

const KEYWORD_GROUP_WEIGHT: Record<string, number> = {
  "terrorism-financing": 20,
  "proliferation-wmd": 20,
  "regulatory-action": 14,
  "bribery-corruption": 14,
  "money-laundering": 14,
  "organised-crime": 14,
  "environmental-crime": 12,
  "human-trafficking": 12,
  "fraud-forgery": 12,
  "market-abuse": 10,
  "tax-crime": 10,
  "cybercrime": 10,
  "insider-threat": 10,
  "ai-misuse": 10,
  "law-enforcement": 6,
  "political-exposure": 2,
};

function scoreToBand(score: number): string {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  if (score >= 25) return "low";
  return "clear";
}

type QuickScreenFn = (
  subject: QuickScreenSubject,
  candidates: QuickScreenCandidate[],
) => QuickScreenResult;
const quickScreen = _quickScreen as QuickScreenFn;
import { getJson, listKeys, setJson } from "@/lib/server/store";
import { postWebhook } from "@/lib/server/webhook";
import { asanaGids } from "@/lib/server/asanaConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
  cadence: "hourly" | "thrice_daily" | "daily" | "weekly" | "monthly";
  scoreThreshold?: number;
  nextRunAt: string;
  lastRunAt?: string;
}

// Fixed-interval cadences (hourly / daily / weekly / monthly) use a
// simple "now + N ms" advance. The thrice_daily cadence is special:
// it fires at three fixed Dubai clock times per MLRO policy, not every
// 8h from enrolment. nextRunAt for thrice_daily is computed by
// nextThriceDailyRun() below — NOT from CADENCE_MS.
const CADENCE_MS: Record<Exclude<Schedule["cadence"], "thrice_daily">, number> = {
  hourly: 60 * 60 * 1_000,
  daily: 24 * 60 * 60 * 1_000,
  weekly: 7 * 24 * 60 * 60 * 1_000,
  monthly: 30 * 24 * 60 * 60 * 1_000,
};

// 08:30 / 15:00 / 17:30 Dubai (UTC+4, no DST) → 04:30 / 11:00 / 13:30 UTC.
const THRICE_DAILY_SLOTS_UTC: Array<[number, number]> = [
  [4, 30],
  [11, 0],
  [13, 30],
];

function nextThriceDailyRun(from: Date): Date {
  const candidates = THRICE_DAILY_SLOTS_UTC.map(([h, m]) => {
    const d = new Date(from);
    d.setUTCHours(h, m, 0, 0);
    if (d.getTime() <= from.getTime()) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  });
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0]!;
}

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

  const asanaToken = process.env["ASANA_TOKEN"];
  if (!asanaToken) {
    console.warn("[ongoing/run] ASANA_TOKEN not set — all Asana task creation will be skipped. Compliance audit trail may be incomplete.");
  }

  const keys = await listKeys("ongoing/subject/");
  // Load subjects in parallel — sequential awaits would time out for large portfolios.
  const loadedSubjects = await Promise.all(keys.map((key) => getJson<EnrolledSubject>(key)));
  const subjects: EnrolledSubject[] = loadedSubjects.filter((s): s is EnrolledSubject => s !== null);

  // Live sanctions corpus (OFAC / UN / EU / UK / EOCN / UAE LTL) from the
  // Netlify Blobs store populated by netlify/functions/refresh-lists cron.
  // Falls back to the static seed fixture when blobs aren't populated
  // (first-run / dev). Loaded once per invocation, not per-subject.
  const CANDIDATES = await loadCandidates();

  const runAt = new Date().toISOString();
  const results: Array<{
    subjectId: string;
    subjectName: string;
    topScore: number;
    rawScore: number;
    severity: string;
    scoreDelta: number;
    escalated: boolean;
    newHits: Array<{ listId: string; listRef: string; candidateName: string }>;
    webhook: Awaited<ReturnType<typeof postWebhook>>;
    asanaTaskUrl?: string;
    asanaSkipReason?: string;
    newsAlertTaskUrl?: string;
    escalationTaskUrl?: string;
    escalationSkipReason?: string;
    adverseMediaRiskTier?: string;
    sarRecommended?: boolean;
  }> = [];

  const nowMs = Date.now();

  // Process subjects in concurrency-limited batches — firing all subjects
  // concurrently bursts Asana API rate limits and risks the 30s Lambda timeout.
  // Batch size 8 keeps parallelism high while staying within API rate limits.
  const CONCURRENCY = 8;
  for (let i = 0; i < subjects.length; i += CONCURRENCY) {
  await Promise.all(subjects.slice(i, i + CONCURRENCY).map(async (s) => {
    try {
      // Respect per-subject schedule. If a schedule exists and the next
      // run isn't due yet, skip this subject. Subjects without a
      // schedule run on every tick (legacy behaviour).
      const schedule = await getJson<Schedule>(`schedule/${s.id}`);
      if (schedule && Date.parse(schedule.nextRunAt) > nowMs) {
        return;
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

      // Keyword-adjusted composite score — adverse-media keywords must factor
      // into risk severity so a subject with terrorism-financing or
      // money-laundering coverage cannot score "clear".
      const kwHaystack = [s.name, ...(s.aliases ?? [])].join(" ");
      const kw = classifyAdverseKeywords(kwHaystack);
      const kwGroups = Array.from(new Set(kw.map((k) => k.group)));
      const kwBoost = Math.min(30, kwGroups.reduce((sum, g) => sum + (KEYWORD_GROUP_WEIGHT[g] ?? 0), 0));
      const adjustedScore = Math.min(100, screen.topScore + kwBoost);
      const adjustedSeverity = scoreToBand(adjustedScore);

      const prev = await getJson<LastSnapshot>(`ongoing/last/${s.id}`);
      const prevFps = prev ? fingerprints(prev.hits) : new Set<string>();
      const newHits = screen.hits.filter(
        (h) => !prevFps.has(`${h.listRef}|${h.candidateName}`),
      );

      // Auto-escalation: if the subject's top score jumped by more than
      // ESCALATION_DELTA between runs, emit a dedicated escalation
      // webhook so the MLRO is paged rather than waiting on the next
      // four-eyes review.
      const scoreDelta = prev ? adjustedScore - prev.topScore : 0;
      const escalated = scoreDelta >= ESCALATION_DELTA;

      // Persist the fresh snapshot (using keyword-adjusted score/severity).
      const snapshot: LastSnapshot = {
        runAt,
        topScore: adjustedScore,
        severity: adjustedSeverity,
        hits: screen.hits.map((h) => ({
          listRef: h.listRef,
          candidateName: h.candidateName,
          score: h.score,
        })),
      };
      await setJson(`ongoing/last/${s.id}`, snapshot);

      // Structured subject profile — append the current-state snapshot
      // into the per-subject dossier so the Cases page / regulator
      // replay has the full rolling history. Best-effort; a profile
      // write failure must not break the ongoing screening loop.
      try {
        const profileKey = `profile/${s.id}`;
        interface ExistingProfile {
          id: string;
          name: string;
          createdAt: string;
          updatedAt: string;
          snapshots: Array<Record<string, unknown>>;
          dispositions: Array<Record<string, unknown>>;
          hitsEverSeen: string[];
          adverseMediaEverSeen: string[];
          aliases?: string[];
          entityType?: string;
          jurisdiction?: string;
        }
        const existing = await getJson<ExistingProfile>(profileKey);
        const nowIso = runAt;
        const snap = {
          at: nowIso,
          topScore: adjustedScore,
          rawScore: screen.topScore,
          severity: adjustedSeverity,
          hits: screen.hits.map((h) => ({
            listId: h.listId,
            listRef: h.listRef,
            candidateName: h.candidateName,
            score: h.score,
            method: h.method,
          })),
          source: "ongoing" as const,
        };
        const base: ExistingProfile = existing ?? {
          id: s.id,
          name: s.name,
          createdAt: nowIso,
          updatedAt: nowIso,
          snapshots: [],
          dispositions: [],
          hitsEverSeen: [],
          adverseMediaEverSeen: [],
          ...(s.aliases && s.aliases.length ? { aliases: s.aliases } : {}),
          ...(s.entityType ? { entityType: s.entityType } : {}),
          ...(s.jurisdiction ? { jurisdiction: s.jurisdiction } : {}),
        };
        const fingerprints = new Set(base.hitsEverSeen);
        for (const h of screen.hits) {
          fingerprints.add(`${h.listRef}|${h.candidateName}`);
        }
        const updated: ExistingProfile = {
          ...base,
          updatedAt: nowIso,
          snapshots: [...base.snapshots.slice(-199), snap],
          hitsEverSeen: Array.from(fingerprints).slice(-500),
        };
        await setJson(profileKey, updated);
      } catch (err) {
        console.warn("[ongoing] profile snapshot update failed — monitoring history may be incomplete:", err instanceof Error ? err.message : err);
      }

      // Adverse-media sweep (Google News RSS) and Taranis AI analysis run in
      // parallel — they are fully independent and together account for the
      // majority of per-subject latency on each monitoring tick.
      const appBaseForNews =
        process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
      interface NewsArticle {
        url: string;
        title: string;
        severity: string;
        snippet?: string;
        source?: string;
        pubDate?: string;
        fuzzyScore?: number;
      }
      interface NewsResponseShape {
        ok: boolean;
        articleCount?: number;
        topSeverity?: string;
        articles?: NewsArticle[];
        keywordGroupCounts?: Array<{ group: string; label: string; count: number }>;
      }
      let newsAlertTaskUrl: string | undefined;
      let newAdverseArticles: NewsArticle[] = [];
      let adverseMediaRiskTier: string | undefined;
      let sarRecommended: boolean | undefined;

      // Run news-search and Taranis adverse-media in parallel.
      await Promise.all([
        // ── News-search sweep ──────────────────────────────────────────────
        (async () => {
          try {
            const adminToken = process.env["ADMIN_TOKEN"];
            const newsRes = await fetch(
              new URL(
                `/api/news-search?q=${encodeURIComponent(s.name)}`,
                appBaseForNews,
              ).toString(),
              {
                signal: AbortSignal.timeout(8_000),
                headers: {
                  accept: "application/json",
                  ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
                },
              },
            );
            if (!newsRes.ok) {
              console.warn(`[ongoing/run] news-search failed for ${s.id}: HTTP ${newsRes.status}`);
            } else {
            const newsPayload = (await newsRes.json().catch((err: unknown) => { console.warn("[hawkeye] ongoing/run JSON parse failed:", err); return null; })) as
                | NewsResponseShape
                | null;
              const articles = newsPayload?.articles ?? [];
              // Find articles whose severity is high/critical AND whose URL
              // we haven't already logged for this subject.
              const seen = await getJson<{ urls: string[] }>(
                `ongoing/adverse-seen/${s.id}`,
              );
              const seenUrls = new Set(seen?.urls ?? []);
              newAdverseArticles = articles.filter(
                (a) =>
                  (a.severity === "high" || a.severity === "critical") &&
                  a.url &&
                  !seenUrls.has(a.url),
              );
              if (articles.length > 0) {
                const allUrls = new Set<string>(seenUrls);
                for (const a of articles) {
                  if (a.url) allUrls.add(a.url);
                }
                // Cap the seen list so it doesn't grow unbounded.
                const capped = Array.from(allUrls).slice(-500);
                await setJson(`ongoing/adverse-seen/${s.id}`, { urls: capped });
              }
              if (newAdverseArticles.length > 0) {
                const asanaToken = process.env["ASANA_TOKEN"];
                const inboxProject = asanaGids.screening();
                if (asanaToken && inboxProject) {
                  try {
                    const topSeverity = newAdverseArticles.some(
                      (a) => a.severity === "critical",
                    )
                      ? "CRITICAL"
                      : "HIGH";
                    const lines: string[] = [];
                    lines.push(
                      `HAWKEYE STERLING · ADVERSE-MEDIA ALERT`,
                    );
                    lines.push(`Subject     : ${s.name} (${s.id})`);
                    lines.push(`Jurisdiction: ${s.jurisdiction ?? "—"}`);
                    lines.push(`Severity    : ${topSeverity}`);
                    lines.push(`Tick        : ${runAt}`);
                    lines.push(`New items   : ${newAdverseArticles.length}`);
                    lines.push("");
                    lines.push(`── ARTICLES ──`);
                    for (const a of newAdverseArticles.slice(0, 10)) {
                      lines.push(`• [${a.severity.toUpperCase()}] ${a.title}`);
                      if (a.source) lines.push(`    source: ${a.source}`);
                      if (a.pubDate) lines.push(`    date  : ${a.pubDate}`);
                      lines.push(`    url   : ${a.url}`);
                    }
                    if (newAdverseArticles.length > 10) {
                      lines.push(`  … and ${newAdverseArticles.length - 10} more`);
                    }
                    lines.push("");
                    lines.push(
                      `Hawkeye     : https://hawkeye-sterling.netlify.app/screening?open=${s.id}`,
                    );
                    const body = {
                      data: {
                        name: `🟥 [ADVERSE-MEDIA · ${topSeverity}] ${s.name} (${s.id}) · ${newAdverseArticles.length} new`,
                        notes: lines.join("\n"),
                        projects: [inboxProject],
                        workspace: asanaGids.workspace(),
                        assignee: asanaGids.assignee(),
                      },
                    };
                    const r = await fetch("https://app.asana.com/api/1.0/tasks", {
                      signal: AbortSignal.timeout(10_000),
                      method: "POST",
                      headers: {
                        "content-type": "application/json",
                        accept: "application/json",
                        authorization: `Bearer ${asanaToken}`,
                      },
                      body: JSON.stringify(body),
                    });
                    if (!r.ok) {
                      const detail = await r.text().catch(() => "");
                      console.warn(
                        `[ongoing/run] adverse-media alert POST rejected for ${s.id}: HTTP ${r.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
                      );
                    } else {
                      const data = (await r.json().catch((err: unknown) => { console.warn("[hawkeye] ongoing/run JSON parse failed:", err); return null; })) as
                        | { data?: { permalink_url?: string } }
                        | null;
                      if (data?.data?.permalink_url) {
                        newsAlertTaskUrl = data.data.permalink_url;
                      } else {
                        console.warn(
                          `[ongoing/run] adverse-media alert POST returned 2xx with no permalink_url for ${s.id}`,
                        );
                      }
                    }
                  } catch (err) {
                    console.warn(
                      `[ongoing/run] adverse-media alert POST failed for ${s.id}:`,
                      err,
                    );
                  }
                }
              }
            } // end else (newsRes.ok)
          } catch (err) {
            console.warn(
              `[ongoing/run] adverse-media sweep failed for ${s.id}:`,
              err,
            );
          }
        })(),

        // ── Taranis AI adverse-media analysis ─────────────────────────────
        // Weaponized adverse-media analysis via Taranis AI (fail-soft).
        // Runs the full MLRO pipeline: FATF predicate mapping, severity scoring,
        // SAR trigger (R.20), counterfactual, investigation narrative.
        (async () => {
          try {
            const taranisResult = await Promise.race([
              searchAdverseMedia(s.name, { limit: 30, minRelevance: 0 }),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("searchAdverseMedia timeout")), 20_000)),
            ]);
            if (taranisResult.ok && taranisResult.items.length > 0) {
              const verdict = analyseAdverseMediaItems(s.name, taranisResult.items);
              adverseMediaRiskTier = verdict.riskTier;
              sarRecommended = verdict.sarRecommended;
            }
          } catch (err) {
            console.warn("[ongoing] adverse media (Taranis) failed:", err instanceof Error ? err.message : err);
          }
        })(),
      ]);

      let asanaTaskUrl: string | undefined;
      let asanaSkipReason: string | undefined;
      // File an Asana task on EVERY tick — ongoing-monitoring subjects must
      // produce one report per run (three per day at thrice_daily cadence)
      // per MLRO requirement. When there are new hits we ship just those;
      // otherwise we ship the full current-state snapshot so the board
      // shows a continuous heartbeat the regulator can audit.
      const adminToken = process.env["ADMIN_TOKEN"] ?? "";
      if (!adminToken) {
        // Fail loud upfront rather than emitting a silent 401 mid-flight —
        // operators need a visible signal in both logs and the per-subject
        // result that the cron is filing nothing.
        asanaSkipReason = "ADMIN_TOKEN not set";
        console.error(
          `[ongoing/run] ADMIN_TOKEN not configured — /api/screening-report will 401 and no Asana task will be filed for ${s.id}`,
        );
      } else {
        try {
          const appBase = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
          const asanaRes = await fetch(
            new URL("/api/screening-report", appBase).toString(),
            {
              signal: AbortSignal.timeout(20_000),
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${adminToken}`,
              },
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
                result: {
                  ...screen,
                  hits: newHits.length > 0 ? newHits : screen.hits,
                },
                trigger: "ongoing",
              }),
            },
          );
          if (!asanaRes.ok) {
            const detail = await asanaRes.text().catch(() => "");
            asanaSkipReason = `screening-report HTTP ${asanaRes.status}`;
            console.error(
              `[ongoing/run] /api/screening-report rejected for ${s.id}: HTTP ${asanaRes.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
            );
          } else {
            const payload = (await asanaRes.json().catch((err: unknown) => { console.warn("[hawkeye] ongoing/run JSON parse failed:", err); return null; })) as
              | { ok?: boolean; taskUrl?: string }
              | null;
            if (payload?.taskUrl) {
              asanaTaskUrl = payload.taskUrl;
            } else {
              asanaSkipReason = "screening-report returned 2xx with no taskUrl";
              console.warn(
                `[ongoing/run] /api/screening-report 2xx but no taskUrl for ${s.id}`,
              );
            }
          }
        } catch (err) {
          asanaSkipReason = err instanceof Error ? err.message : String(err);
          console.error(
            `[ongoing/run] /api/screening-report POST threw for ${s.id}:`,
            err,
          );
        }
      }

      // Auto-escalation: also drop a task on the escalations board so the
      // MLRO sees the jump immediately. Independent of the delta task —
      // an escalation can fire without new hits (e.g. reinforced score
      // on existing hits) and both boards need to carry the signal.
      //
      // If the escalations board isn't configured, we log loudly and
      // continue; silently dropping the signal would mean the MLRO
      // misses a score-jump event the compliance report claims was
      // flagged. Operators scanning logs must be able to see "we
      // detected an escalation but had nowhere to file it".
      let escalationTaskUrl: string | undefined;
      let escalationSkipReason: string | undefined;
      const escalationsProject = asanaGids.escalations();
      const asanaToken = process.env["ASANA_TOKEN"];
      // Keep our branch's detailed skip-reason logging (so ops sees WHY an
      // escalation was dropped) AND pick up the assignee field that main
      // added — every Asana task now lands on Luisa's queue by default
      // via ASANA_ASSIGNEE_GID (overridable via env).
      if (escalated) {
        // Deduplication: only fire escalation task when severity bucket changes,
        // not on every tick where the score stays elevated (which would flood
        // the escalations board with duplicate tasks for the same subject).
        const escKey = `ongoing/escalation-seen/${s.id}`;
        const lastEsc = await getJson<{ severity: string; firedAt: string }>(escKey);
        const currentSeverity = adjustedSeverity; // e.g. "high", "critical"
        const escalationIsDuplicate = Boolean(lastEsc && lastEsc.severity === currentSeverity);

        if (escalationIsDuplicate) {
          escalationSkipReason = `already filed for severity=${currentSeverity} at ${lastEsc!.firedAt}`;
        } else if (!asanaToken) {
          escalationSkipReason = "ASANA_TOKEN not set";
          console.warn(
            `[ongoing/run] escalation detected for ${s.id} but ASANA_TOKEN is not set — no task filed`,
          );
        } else if (!escalationsProject) {
          escalationSkipReason = "escalations project not configured";
          console.warn(
            `[ongoing/run] escalation detected for ${s.id} but escalations project GID is not set — no task filed`,
          );
        } else {
          try {
            const body = {
              data: {
                name: `🚨 Score jumped +${scoreDelta} — ${s.name} (${s.id})`,
                notes: [
                  `Subject: ${s.name} (${s.id})`,
                  `Jurisdiction: ${s.jurisdiction ?? "—"}`,
                  `Previous top score: ${prev?.topScore ?? "n/a"}`,
                  `New top score: ${adjustedScore} (raw: ${screen.topScore}, kw boost: +${kwBoost})`,
                  `Delta: +${scoreDelta} (threshold ≥ ${ESCALATION_DELTA})`,
                  `Severity: ${adjustedSeverity}`,
                  `New hits: ${newHits.length}`,
                  `Triggered at: ${runAt}`,
                ].join("\n"),
                projects: [escalationsProject],
                workspace: asanaGids.workspace(),
                assignee: asanaGids.assignee(),
              },
            };
            const r = await fetch("https://app.asana.com/api/1.0/tasks", {
              signal: AbortSignal.timeout(10_000),
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: "application/json",
                authorization: `Bearer ${asanaToken}`,
              },
              body: JSON.stringify(body),
            });
            if (!r.ok) {
              // Asana sometimes returns HTML error pages on auth failure;
              // try-parse the body so we surface the real status code even
              // when the JSON path can't be read.
              const raw = await r.text().catch(() => "");
              let detail = `HTTP ${r.status}`;
              try {
                const j = raw ? (JSON.parse(raw) as { errors?: Array<{ message?: string }> }) : null;
                if (j?.errors?.[0]?.message) detail = `${detail}: ${j.errors[0].message}`;
                else if (raw) detail = `${detail}: ${raw.slice(0, 200)}`;
              } catch {
                if (raw) detail = `${detail}: ${raw.slice(0, 200)}`;
              }
              escalationSkipReason = `asana rejected: ${detail}`;
              console.error(
                `[ongoing/run] asana rejected escalation task for ${s.id}: ${detail}`,
              );
            } else {
              const data = (await r.json().catch((err: unknown) => { console.warn("[hawkeye] ongoing/run JSON parse failed:", err); return null; })) as
                | { data?: { gid?: string; permalink_url?: string } }
                | null;
              if (data?.data?.permalink_url) {
                escalationTaskUrl = data.data.permalink_url;
                // Persist fingerprint so future ticks with same severity
                // bucket don't re-create a duplicate escalation task.
                await setJson(escKey, { severity: currentSeverity, firedAt: runAt });
              } else {
                escalationSkipReason = "asana 2xx with no permalink_url";
                console.error(
                  `[ongoing/run] asana 2xx but missing permalink_url for ${s.id}`,
                );
              }
            }
          } catch (err) {
            escalationSkipReason = err instanceof Error ? err.message : String(err);
            console.error(
              `[ongoing/run] escalation POST threw for ${s.id}:`,
              err,
            );
          }
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
        severity: adjustedSeverity,
        topScore: adjustedScore,
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

      // Advance the schedule clock. thrice_daily pins to the next fixed
      // Dubai slot (08:30 / 15:00 / 17:30); everything else uses a simple
      // now + interval advance.
      if (schedule) {
        const nextRunAt =
          schedule.cadence === "thrice_daily"
            ? nextThriceDailyRun(new Date(nowMs)).toISOString()
            : new Date(nowMs + CADENCE_MS[schedule.cadence]).toISOString();
        const next: Schedule = {
          ...schedule,
          lastRunAt: runAt,
          nextRunAt,
        };
        await setJson(`schedule/${s.id}`, next);
      }

      results.push({
        subjectId: s.id,
        subjectName: s.name,
        topScore: adjustedScore,
        rawScore: screen.topScore,
        severity: adjustedSeverity,
        scoreDelta,
        escalated,
        newHits: newHits.map((h) => ({
          listId: h.listId,
          listRef: h.listRef,
          candidateName: h.candidateName,
        })),
        webhook,
        ...(asanaTaskUrl ? { asanaTaskUrl } : {}),
        ...(asanaSkipReason ? { asanaSkipReason } : {}),
        ...(newsAlertTaskUrl ? { newsAlertTaskUrl } : {}),
        ...(escalationTaskUrl ? { escalationTaskUrl } : {}),
        ...(escalationSkipReason ? { escalationSkipReason } : {}),
        ...(adverseMediaRiskTier !== undefined ? { adverseMediaRiskTier } : {}),
        ...(sarRecommended !== undefined ? { sarRecommended } : {}),
      });
    } catch (err) {
      results.push({
        subjectId: s.id,
        subjectName: s.name ?? "",
        topScore: 0,
        rawScore: 0,
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
  }));
  } // end CONCURRENCY batch loop

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
