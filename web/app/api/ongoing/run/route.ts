import { NextResponse } from "next/server";
// Import from the concrete module, not the index barrel — see super-brain
// route for why pulling in the 80-module barrel at cold-start kills these
// Netlify Functions with 502s.
import { quickScreen as _quickScreen } from "../../../../../src/brain/quick-screen.js";
import { searchAdverseMedia } from "../../../../../src/integrations/taranisAi.js";
import { analyseAdverseMediaItems } from "../../../../../src/brain/adverse-media-analyser.js";
import type {
  QuickScreenCandidate,
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";
import { loadCandidatesWithHealth } from "@/lib/server/candidates-loader";
import { incrementCounter, setGauge } from "@/lib/server/metrics-store";
import { classifyAdverseKeywords } from "@/lib/data/adverse-keywords";
import {
  type CustomerRiskTier,
  MONITORING_FREQUENCIES,
  isNewsCheckDue,
  isScreenDueWithFloor,
  nextScreenAtWithFloor,
  loadAlertThresholds,
  meetsAdverseMediaThreshold as _meetsAdverseMediaThreshold,
  detectChanges,
  loadMonitoringSnapshot,
  saveMonitoringSnapshot as _saveMonitoringSnapshot,
  buildQueueItem as _buildQueueItem,
  sortMonitoringQueue as _sortMonitoringQueue,
  type AdverseMediaCategory,
} from "@/lib/server/ongoing-monitoring-config";

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
  if (score >= 95) return "critical";
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  if (score > 0) return "low";
  return "clear";
}

type QuickScreenFn = (
  _subject: QuickScreenSubject,
  _candidates: QuickScreenCandidate[],
) => QuickScreenResult;
const quickScreen = _quickScreen as QuickScreenFn;
import { getJson, listKeys, setJson } from "@/lib/server/store";
import type { ScreeningHistoryEntry } from "@/lib/types";
import { postWebhook } from "@/lib/server/webhook";
import { deliverWebhookEvent } from "@/lib/server/webhook-delivery";
import { ESCALATION_DELTA, shouldEscalate } from "@/lib/server/ongoing-escalation";
import { asanaGids } from "@/lib/server/asanaConfig";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

// Validated customer risk tiers.
const VALID_RISK_TIERS = new Set<CustomerRiskTier>([
  "standard",
  "enhanced",
  "intensive",
  "pep",
  "prohibited",
]);

function toRiskTier(raw: unknown): CustomerRiskTier {
  if (typeof raw === "string" && VALID_RISK_TIERS.has(raw as CustomerRiskTier)) {
    return raw as CustomerRiskTier;
  }
  return "standard";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface EnrolledSubject {
  id: string;
  tenantId?: string;
  name: string;
  aliases?: string[];
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  group?: string;
  caseId?: string;
  enrolledAt: string;
  /** Customer risk tier for risk-based monitoring frequency. */
  riskTier?: CustomerRiskTier;
  /** True when the subject is a politically exposed person (FATF R.12). */
  isPep?: boolean;
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

// Risk-based schedule — written by the monitoring run, consumed by the
// queue endpoint and by isScreenDue / isNewsCheckDue helpers.
interface RiskBasedSchedule {
  subjectId: string;
  riskTier: CustomerRiskTier;
  nextScreenAt: string;
  lastScreenAt?: string;
  nextNewsCheckAt: string;
  lastNewsCheckAt?: string;
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

// ESCALATION_DELTA + shouldEscalate moved to @/lib/server/ongoing-escalation
// so the threshold is unit-testable and can't drift silently. Imported above.

// Validate NEXT_PUBLIC_APP_URL before using it for internal server→server calls.
// Rejects URLs with credentials, unexpected schemes, or path prefixes that could
// redirect the ADMIN_TOKEN to an attacker-controlled host. Falls back to
// Netlify's runtime-injected URL (same validation applies) when
// NEXT_PUBLIC_APP_URL is unset at runtime, e.g. scoped to Builds only.
function safeAppBase(): string {
  const raw = process.env["NEXT_PUBLIC_APP_URL"] || process.env["URL"];
  if (!raw) return "http://localhost:3000";
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "http://localhost:3000";
    if (u.username || u.password) return "http://localhost:3000";
    if (u.pathname !== "/" && u.pathname !== "") return "http://localhost:3000";
    return `${u.protocol}//${u.host}`;
  } catch {
    return "http://localhost:3000";
  }
}

function fingerprints(hits: LastHit[]): Set<string> {
  return new Set(hits.map((h) => `${h.listRef}|${h.candidateName}`));
}

export async function POST(req: Request): Promise<NextResponse> {
  const runStartMs = Date.now();
  // Bearer token protection. If ONGOING_RUN_TOKEN is not configured the
  // endpoint is locked down entirely — a missing env var must not silently
  // make this a public endpoint (Netlify cron jobs always inject the token).
  const expected = process.env["ONGOING_RUN_TOKEN"];
  if (!expected) {
    return NextResponse.json({ ok: false, error: "service unavailable" }, { status: 503 });
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const COMPARE_KEY = Buffer.from("hawkeye-token-compare-v1", "utf8");
  const ha = createHmac("sha256", COMPARE_KEY).update(expected).digest();
  const hb = createHmac("sha256", COMPARE_KEY).update(got).digest();
  if (!timingSafeEqual(ha, hb)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // CRON-001 defense-in-depth: in production also require Netlify's
  // scheduled-function header. A leaked ONGOING_RUN_TOKEN alone cannot
  // trigger this route from an attacker's host because Netlify injects
  // x-netlify-scheduled-function only for scheduled invocations.
  // Mirrors refresh-lists.ts:177-187.
  const isScheduled = req.headers.get("x-netlify-scheduled-function") === "true";
  if (process.env["NODE_ENV"] === "production" && !isScheduled) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const asanaToken = process.env["ASANA_TOKEN"];
  if (!asanaToken) {
    console.warn("[ongoing/run] ASANA_TOKEN not set — all Asana task creation will be skipped. Compliance audit trail may be incomplete.");
  }

  const keys = await listKeys("ongoing/subject/");
  // Load subjects in parallel — sequential awaits would time out for large portfolios.
  const loadedSubjects = await Promise.all(keys.map((key) => getJson<EnrolledSubject>(key).catch(() => null)));
  const subjects: EnrolledSubject[] = loadedSubjects.filter((s): s is EnrolledSubject => s !== null);

  // SANCT-001: fail-closed on missing sanctions corpus. Loading via
  // loadCandidatesWithHealth() lets us refuse to screen if both OFAC SDN and
  // UN Consolidated are absent (the same gate /api/quick-screen enforces).
  // Without this, an ingestion outage would silently produce 'CLEAR' for
  // every subject, masking real exposure.
  let CANDIDATES: QuickScreenCandidate[];
  try {
    const { candidates, health } = await loadCandidatesWithHealth();
    const loadedListIds = new Set(candidates.map((c) => c.listId));
    const criticalLists = ["ofac_sdn", "un_consolidated"] as const;
    const missingCritical = criticalLists.filter((id) => !loadedListIds.has(id));
    if (candidates.length === 0 || missingCritical.length === criticalLists.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "screening_corpus_unavailable",
          missingLists: missingCritical,
          health,
        },
        { status: 503 },
      );
    }
    CANDIDATES = candidates;
  } catch (err) {
    console.error("[ongoing/run] loadCandidatesWithHealth failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: "screening_corpus_unavailable" },
      { status: 503 },
    );
  }

  const runAt = new Date().toISOString();
  const results: Array<{
    subjectId: string;
    subjectName: string;
    riskTier?: CustomerRiskTier;
    topScore: number;
    rawScore: number;
    severity: string;
    scoreDelta: number;
    escalated: boolean;
    changeSummary?: string[];
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
      // ── Risk-based frequency check ──────────────────────────────────────────
      // Determine whether a re-screen / news-check is due based on the subject's
      // risk tier and the risk-based schedule stored from the previous run.
      const riskTier = toRiskTier(s.riskTier);
      const freq = MONITORING_FREQUENCIES[riskTier];
      const riskSchedule = await getJson<RiskBasedSchedule>(`ongoing/risk-schedule/${s.id}`);

      if (riskSchedule?.nextScreenAt) {
        // Global 3×/day floor (MLRO mandate 2026-06-04): a subject is due when
        // its risk-tier cadence is due OR a global-floor slot has elapsed since
        // the last screen — keyed off lastScreenAt rather than the stored
        // nextScreenAt, so even subjects scheduled far out under a low-risk tier
        // (or enrolled before this change) are pulled into at-least-3×/day
        // monitoring. Tighter risk-tier cadences (PEP/prohibited) still apply.
        const lastScreenMs = riskSchedule.lastScreenAt
          ? Date.parse(riskSchedule.lastScreenAt)
          : null;
        if (!isScreenDueWithFloor(riskTier, lastScreenMs, nowMs)) return; // not due yet
      } else {
        // Legacy cadence-based schedule fallback for subjects enrolled before
        // risk-based scheduling was introduced.
        const legacySchedule = await getJson<Schedule>(`schedule/${s.id}`);
        if (legacySchedule) {
          const nextRunAt = Date.parse(legacySchedule.nextRunAt);
          if (Number.isFinite(nextRunAt) && nextRunAt > nowMs) return; // skip if not due
        }
      }

      // Determine whether a news/adverse-media check is due on this tick.
      const lastNewsCheckMs = riskSchedule?.lastNewsCheckAt
        ? Date.parse(riskSchedule.lastNewsCheckAt)
        : null;
      const newsCheckDue = isNewsCheckDue(riskTier, lastNewsCheckMs, nowMs);

      // Load per-customer alert thresholds (defaults apply if never configured).
      const _alertThresholds = await loadAlertThresholds(s.id);

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
      // Compare keyword-adjusted score (the value that gets persisted)
      // so the threshold and the snapshot agree.
      const scoreDelta = prev ? adjustedScore - prev.topScore : 0;
      const escalated = shouldEscalate(prev?.topScore, adjustedScore);

      // ── Change detection ─────────────────────────────────────────────────────
      // Load the previous monitoring snapshot to compare adverse-media categories
      // and jurisdiction. detectChanges fires an automatic escalation when:
      //   - Sanctions score increased by > 10 points
      //   - A new adverse-media category emerged (not in prior snapshot)
      //   - Jurisdiction changed to a CAHRA or FATF-blacklist country
      const prevMonSnapshot = await loadMonitoringSnapshot(s.id);
      const currentAdverseCategories = kwGroups as AdverseMediaCategory[];
      const changeDetection = detectChanges({
        previousScore: prevMonSnapshot?.topScore ?? prev?.topScore,
        currentScore: adjustedScore,
        previousAdverseCategories: prevMonSnapshot?.adverseMediaCategories ?? [],
        currentAdverseCategories,
        previousJurisdiction: prevMonSnapshot?.jurisdiction,
        currentJurisdiction: s.jurisdiction ?? null,
      });
      // Escalate on either the legacy score-jump rule OR the new change-detection rules.
      const changeEscalated = escalated || changeDetection.shouldEscalate;

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

      // Write a screening-history entry so the ReScreenDiff component shows a
      // populated timeline. Zero-hit runs MUST also write — the absence of hits
      // is itself the compliance record (Federal Decree-Law No. 10 of 2025 Art.16 continuous monitoring).
      // The key pattern screening-history/<id>/<iso-ts> matches the GET handler
      // in /api/screening-history/route.ts which reads this namespace.
      const historyEntry: ScreeningHistoryEntry = {
        at: runAt,
        topScore: adjustedScore,
        severity: adjustedSeverity as ScreeningHistoryEntry["severity"],
        lists: Array.from(new Set(screen.hits.map((h) => h.listId))),
        hits: screen.hits.map((h) => `${h.listId}:${h.listRef}`),
      };
      await setJson(`screening-history/${s.id}/${runAt}`, historyEntry);

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
          snapshots: [...base.snapshots.slice(-999), snap],
          hitsEverSeen: Array.from(fingerprints).slice(-500),
        };
        await setJson(profileKey, updated);
      } catch (err) {
        console.warn("[ongoing] profile snapshot update failed — monitoring history may be incomplete:", err instanceof Error ? err.message : err);
      }

      // Adverse-media sweep (Google News RSS) and Taranis AI analysis run in
      // parallel — they are fully independent and together account for the
      // majority of per-subject latency on each monitoring tick.
      const appBaseForNews = safeAppBase();
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
            let _taranisTimer: ReturnType<typeof setTimeout>;
            const taranisResult = await Promise.race([
              searchAdverseMedia(s.name, { limit: 30, minRelevance: 0 }),
              new Promise<never>((_, reject) => { _taranisTimer = setTimeout(() => reject(new Error("searchAdverseMedia timeout")), 20_000); }),
            ]).finally(() => clearTimeout(_taranisTimer));
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
          const appBase = safeAppBase();
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
          asanaSkipReason = "screening-report request failed";
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
            escalationSkipReason = "escalation task creation failed";
            console.error(
              `[ongoing/run] escalation POST threw for ${s.id}:`,
              err,
            );
          }
        }
      }

      // Write audit chain entry for every monitoring run so a regulator can
      // verify continuous coverage — not just when new hits are found.
      // No-change runs use event "ongoing.monitor_tick" (a lightweight
      // heartbeat); new-hit runs use "new_hits_alert" with full hit detail.
      if (newHits.length > 0) {
        void writeAuditChainEntry({
          event: "new_hits_alert",
          actor: "cron_internal",
          subjectId: s.id,
          subjectName: s.name,
          severity: adjustedSeverity,
          topScore: adjustedScore,
          newRiskScore: adjustedScore,
          riskTier,
          scoreDelta,
          newHitCount: newHits.length,
          runAt,
          newHits: newHits.slice(0, 10).map((h) => ({
            listId: h.listId,
            listRef: h.listRef,
            candidateName: h.candidateName,
          })),
        }, s.tenantId ?? process.env["DEFAULT_TENANT"] ?? "default").catch((err) => console.warn("[ongoing/run] audit chain write failed (new_hits_alert):", err instanceof Error ? err.message : String(err)));
      } else {
        // Heartbeat entry: proves the subject was screened even with no new hits.
        // Regulators can audit the complete monitoring cadence from these entries.
        void writeAuditChainEntry({
          event: "ongoing.monitor_tick",
          actor: "cron_internal",
          subjectId: s.id,
          subjectName: s.name,
          severity: adjustedSeverity,
          topScore: adjustedScore,
          newRiskScore: adjustedScore,
          riskTier,
          scoreDelta: 0,
          newHitCount: 0,
          runAt,
        }, s.tenantId ?? process.env["DEFAULT_TENANT"] ?? "default").catch((err) => console.warn("[ongoing/run] audit chain write failed (monitor_tick):", err instanceof Error ? err.message : String(err)));
      }

      const webhookType: "screening.escalated" | "screening.delta" | "ongoing.rerun" =
        changeEscalated
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
        escalated: changeEscalated,
        newHits: newHits.map((h) => ({
          listId: h.listId,
          listRef: h.listRef,
          candidateName: h.candidateName,
        })),
        ...(asanaTaskUrl ? { asanaTaskUrl } : {}),
        generatedAt: runAt,
        source: "hawkeye-sterling",
      });

      // H1: Deliver to tenant-registered webhooks (multi-endpoint registry).
      // Determine the most specific event type from the hit list IDs — EOCN
      // hits require real-time delivery under Cabinet Resolution 74/2020 Art.4.
      if (newHits.length > 0) {
        const tenant = process.env["DEFAULT_TENANT"] ?? "default";
        const hitListIds = new Set(newHits.map((h) => h.listId));
        const isEocnHit = hitListIds.has("uae_eocn");
        const eventType = isEocnHit ? "eocn_hit" : "sanctions_hit";
        void deliverWebhookEvent(tenant, eventType, {
          subject: s.name,
          subjectId: s.id,
          listId: newHits[0]?.listId ?? "",
          listRef: newHits[0]?.listRef ?? "",
          score: adjustedScore,
          severity: adjustedSeverity,
          caseId: s.caseId,
          newHitCount: newHits.length,
          escalated: changeEscalated,
        }).catch((err) => console.warn("[ongoing/run] deliverWebhookEvent failed:", err instanceof Error ? err.message : String(err)));
      }

      // ── Advance schedules ────────────────────────────────────────────────────
      // 1. Risk-based schedule: compute next screen / news-check timestamps from
      //    the subject's risk tier interval. This is the authoritative schedule
      //    used by the queue endpoint and the isScreenDue helper.
      // Apply the global 3×/day floor: never schedule the next screen later than
      // the next global-floor slot, regardless of the risk-tier interval.
      const nextScreenAtMs = nextScreenAtWithFloor(riskTier, nowMs, nowMs);
      const nextNewsCheckAtMs = nowMs + freq.newsCheckIntervalDays * 24 * 60 * 60 * 1_000;
      const updatedRiskSchedule: RiskBasedSchedule = {
        subjectId: s.id,
        riskTier,
        nextScreenAt: new Date(nextScreenAtMs).toISOString(),
        lastScreenAt: runAt,
        nextNewsCheckAt: new Date(nextNewsCheckAtMs).toISOString(),
        ...(newsCheckDue ? { lastNewsCheckAt: runAt } : riskSchedule?.lastNewsCheckAt ? { lastNewsCheckAt: riskSchedule.lastNewsCheckAt } : {}),
      };
      await setJson(`ongoing/risk-schedule/${s.id}`, updatedRiskSchedule);

      // 2. Legacy cadence-based schedule — update for backward compatibility.
      const schedule = await getJson<Schedule>(`schedule/${s.id}`);
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
        riskTier,
        topScore: adjustedScore,
        rawScore: screen.topScore,
        severity: adjustedSeverity,
        scoreDelta,
        escalated: changeEscalated,
        changeSummary: changeDetection.changeSummary,
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
      console.error("[ongoing/run] subject processing failed:", err);
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
          error: "Webhook delivery failed — please retry.",
        },
      });
      // Record the processing failure in the audit chain so the regulator can
      // identify subjects that were skipped due to errors in a given run.
      void writeAuditChainEntry({
        event: "ongoing.monitor_error",
        actor: "cron_internal",
        subjectId: s.id,
        subjectName: s.name ?? "",
        error: "subject processing failed — see server logs",
        runAt,
      }, s.tenantId ?? process.env["DEFAULT_TENANT"] ?? "default").catch((e) => console.warn("[ongoing/run] audit chain write failed (monitor_error):", e instanceof Error ? e.message : String(e)));
    }
  }));
  } // end CONCURRENCY batch loop

  // CG-3 standing accountability: the 3×/day global floor multiplies run
  // volume as enrolment grows, so runtime and Asana load must be observable.
  // maxDuration is 30s — warn at 80% of the budget so the operator sees
  // timeout pressure before runs start getting killed.
  const durationMs = Date.now() - runStartMs;
  const asanaTasksFiled = results.filter((r) => r.asanaTaskUrl).length;
  setGauge("hawkeye_ongoing_run_duration_ms", durationMs);
  setGauge("hawkeye_ongoing_run_subjects", subjects.length);
  incrementCounter("hawkeye_ongoing_run_total", 1, {
    timeout_pressure: durationMs > 24_000 ? "high" : "normal",
  });
  if (asanaTasksFiled > 0) {
    incrementCounter("hawkeye_ongoing_asana_tasks_total", asanaTasksFiled);
  }
  if (durationMs > 24_000) {
    console.warn(
      `[ongoing/run] CG-3 timeout pressure: run took ${durationMs}ms of 30000ms budget ` +
      `(${subjects.length} subjects, ${results.length} rescreened, ${asanaTasksFiled} Asana tasks) — ` +
      `consider raising maxDuration or sharding the portfolio`,
    );
  }

  return NextResponse.json({
    ok: true,
    runAt,
    durationMs,
    total: subjects.length,
    rescreened: results.length,
    withNewHits: results.filter((r) => r.newHits.length > 0).length,
    escalations: results.filter((r) => r.escalated).length,
    results,
  });
}
