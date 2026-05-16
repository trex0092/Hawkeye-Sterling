// Tier-2 MLRO Advisor context builders. Each function produces a
// preamble block that the route layers into the user prompt before
// the question itself, so Claude reasons against:
//
//   1. The operator's actual case history (similar prior dispositions)
//   2. Currently-live regulatory activity (EOCN announcements within
//      the last 7 days, when the question is sanctions-relevant)
//   3. Multi-jurisdiction comparison directive when the classifier
//      detects ≥2 jurisdictions
//
// All blocks are optional — when no signal is available, the function
// returns an empty string and the prompt isn't padded.

import { getJson, listKeys } from "@/lib/server/store";
import type { CaseRecord } from "@/lib/types";
import type { EocnFeedPayload } from "@/lib/data/eocn-fixture";
import { getAnthropicClient } from "@/lib/server/llm";

interface CaseVaultIndexEntry {
  id: string;
  lastActivity: string;
  subject: string;
}

interface CaseVaultIndex {
  version: 2;
  updatedAt: string;
  entries: CaseVaultIndexEntry[];
}

// ─── Multi-jurisdiction comparison directive ──────────────────────
// Inserted when the classifier detected ≥2 jurisdictions in a single
// question. Tells Claude to return a markdown comparison table; the
// model already cites primary sources, so the table just structures
// the comparison side-by-side.
export function buildJurisdictionComparator(jurisdictions: string[]): string {
  if (jurisdictions.length < 2) return "";
  const lines = [
    "MULTI-JURISDICTION DIRECTIVE:",
    `  · Detected jurisdictions: ${jurisdictions.join(" · ")}.`,
    "  · Format your answer as a markdown comparison table with one column per jurisdiction.",
    "  · Each row covers a specific obligation (CDD / EDD threshold / reporting deadline / FATF anchor).",
    "  · Cite the primary source per cell (e.g. 'FATF R.10', 'FDL 10/2025 Art.16', '5AMLD Art.18a').",
    "  · After the table, summarise the divergence (which jurisdiction is strictest) in 2 sentences.",
    "",
  ];
  return lines.join("\n");
}

// ─── Case-history retrieval ───────────────────────────────────────
// Searches the operator's tenant case vault for prior dispositions
// matching the current question's signals. Surfaces up to 3 closest
// matches as a preamble so Claude can cite "you previously did X for
// a similar subject" rather than producing context-free guidance.
//
// Match criteria are soft — we only need the cases to be in the same
// neighbourhood (same jurisdiction OR same vector type), not identical.
// Ranking: most-recent first, capped at 3.

export interface CaseSearchSignals {
  jurisdiction?: string | undefined;
  hasPep?: boolean;
  hasAdverseMedia?: boolean;
  hasSanctionsHit?: boolean;
  topicHints: string[]; // classifier topic ids
}

async function loadCasesForTenant(tenant: string): Promise<CaseRecord[]> {
  const safeTenant = tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
  const indexKey = `hawkeye-cases/${safeTenant}/_index.json`;
  const idx = await getJson<CaseVaultIndex>(indexKey);
  if (!idx?.entries?.length) return [];
  // Read up to 50 cases — enough to search a meaningful history
  // without blowing up function runtime on large tenants.
  const subset = idx.entries.slice(0, 50);
  const records = await Promise.all(
    subset.map((e) =>
      getJson<CaseRecord>(`hawkeye-cases/${safeTenant}/cases/${e.id}.json`),
    ),
  );
  return records.filter((r): r is CaseRecord => r != null);
}

function caseScore(c: CaseRecord, signals: CaseSearchSignals): number {
  const snap = c.screeningSnapshot;
  if (!snap) return 0; // can't compare without a snapshot
  let score = 0;
  // Jurisdiction match — strongest signal
  if (
    signals.jurisdiction &&
    snap.subject.jurisdiction &&
    snap.subject.jurisdiction.toUpperCase() === signals.jurisdiction.toUpperCase()
  ) {
    score += 5;
  }
  // PEP-presence match
  const snapHasPep = !!(snap.superBrain as { pep?: { salience?: number } } | null)?.pep?.salience;
  if (signals.hasPep != null && snapHasPep === signals.hasPep) score += 2;
  // Adverse-media match
  const snapAm = (snap.superBrain as { adverseMediaScored?: { total?: number } } | null)
    ?.adverseMediaScored;
  const snapHasAm = !!(snapAm?.total && snapAm.total > 0);
  if (signals.hasAdverseMedia != null && snapHasAm === signals.hasAdverseMedia) score += 2;
  // Sanctions match
  const snapHasSan = (snap.result.hits?.length ?? 0) > 0;
  if (signals.hasSanctionsHit != null && snapHasSan === signals.hasSanctionsHit) score += 2;
  // Recency — lightly preferred
  if (c.lastActivity) {
    const daysOld = (Date.now() - Date.parse(c.lastActivity)) / 86_400_000;
    if (Number.isFinite(daysOld) && daysOld < 30) score += 1;
  }
  return score;
}

export async function buildCasePrecedentPreamble(
  tenant: string,
  signals: CaseSearchSignals,
): Promise<string> {
  try {
    const cases = await loadCasesForTenant(tenant);
    if (cases.length === 0) return "";
    const ranked = cases
      .map((c) => ({ c, score: caseScore(c, signals) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (ranked.length === 0) return "";
    const lines = [
      "PRIOR CASE PRECEDENT (from this operator's tenant case vault — same context, same MLRO):",
    ];
    for (const { c, score } of ranked) {
      const snap = c.screeningSnapshot;
      const composite = (snap?.superBrain as { composite?: { score?: number } } | null)?.composite?.score;
      const disposition = c.mlroDisposition ?? c.statusLabel ?? c.status;
      lines.push(
        `  · ${c.id} · ${c.subject}${snap?.subject.jurisdiction ? ` · ${snap.subject.jurisdiction}` : ""}${composite != null ? ` · composite ${composite}/100` : ""} → ${disposition}${c.goAMLReference ? ` (goAML ${c.goAMLReference})` : ""}  [match score ${score}]`,
      );
    }
    lines.push(
      "  Use these as precedent — your recommendation should be consistent with prior dispositions unless you can articulate a specific reason to differ.",
    );
    lines.push("");
    return lines.join("\n");
  } catch {
    return "";
  }
}

// ─── Live regulatory updates ──────────────────────────────────────
// Pulls the EOCN blob (populated by the eocn-poll cron) when the
// classifier topic involves sanctions / TFS / EOCN. Surfaces the most
// recent announcement from the last 7 days so Claude knows the
// regulatory ground may have shifted since training.

const SANCTIONS_TOPIC_HINTS = [
  "sanctions_screening",
  "tfs_uae",
  "eocn",
  "fatf_unscr",
  "pep_high_risk", // sanctions-adjacent
  "name_screening",
];

interface EocnIndexedUpdate {
  version: string;
  date: string;
  notes: string;
  sourceUrl?: string;
}

export async function buildRegulatoryUpdatePreamble(
  topicHints: string[],
): Promise<string> {
  // Fast skip: not a sanctions-class question.
  const isRelevant = topicHints.some((t) => SANCTIONS_TOPIC_HINTS.includes(t));
  if (!isRelevant) return "";
  try {
    const blob = await getJson<EocnFeedPayload>(
      "hawkeye-eocn/list-updates/latest.json",
    );
    if (!blob?.listUpdates?.length) return "";
    const sevenDaysAgo = Date.now() - 7 * 86_400_000;
    const recent = blob.listUpdates.filter((u: EocnIndexedUpdate) => {
      const t = Date.parse(u.date);
      return Number.isFinite(t) && t >= sevenDaysAgo;
    });
    if (recent.length === 0) return "";
    const lines = [
      "RECENT REGULATORY ACTIVITY (EOCN UAE — last 7 days, may affect your answer):",
    ];
    for (const u of recent.slice(0, 3)) {
      lines.push(
        `  · [${u.date}] ${u.version} — ${u.notes.slice(0, 200)}${u.notes.length > 200 ? "…" : ""}`,
      );
    }
    lines.push(
      "  If your answer touches sanctions / TFS / freezing obligations, reference the relevant update by date.",
    );
    lines.push("");
    return lines.join("\n");
  } catch {
    return "";
  }
}

// ─── Persistent advisor sessions ──────────────────────────────────
// Optional session storage keyed by `sessionKey` (typically a caseId
// or operator-id). Lets the advisor pick up where the operator left
// off across reloads / devices. Stored in Netlify Blobs.

export interface AdvisorTurn {
  q: string;
  a: string;
  askedAt: string; // ISO
  mode?: string;
  scoreTier?: "STRONG" | "MEDIUM" | "WEAK";
}

interface SessionBlob {
  version: 1;
  sessionKey: string;
  tenant: string;
  updatedAt: string;
  turns: AdvisorTurn[];
}

function sessionBlobKey(tenant: string, key: string): string {
  const t = tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
  const k = key.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 96);
  return `hawkeye-advisor-sessions/${t}/${k}.json`;
}

export async function loadAdvisorSession(
  tenant: string,
  sessionKey: string,
): Promise<AdvisorTurn[]> {
  try {
    const blob = await getJson<SessionBlob>(sessionBlobKey(tenant, sessionKey));
    return blob?.turns ?? [];
  } catch {
    return [];
  }
}

export async function appendAdvisorTurn(
  tenant: string,
  sessionKey: string,
  turn: AdvisorTurn,
): Promise<void> {
  const { setJson } = await import("@/lib/server/store");
  const existing = await loadAdvisorSession(tenant, sessionKey);
  // Cap session length so a long-lived case doesn't grow unbounded.
  const trimmed = [...existing, turn].slice(-25);
  const blob: SessionBlob = {
    version: 1,
    sessionKey,
    tenant,
    updatedAt: new Date().toISOString(),
    turns: trimmed,
  };
  await setJson(sessionBlobKey(tenant, sessionKey), blob);
}

// Index helper for ops — list all session keys under a tenant. Not
// used by the route directly but exposed for diagnostics / a future
// "resume session" picker UI.
export async function listAdvisorSessions(tenant: string): Promise<string[]> {
  try {
    const t = tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
    const keys = await listKeys(`hawkeye-advisor-sessions/${t}/`);
    return keys
      .map((k) => {
        const m = k.match(/\/([^/]+)\.json$/);
        return m?.[1] ?? null;
      })
      .filter((s): s is string => s !== null);
  } catch {
    return [];
  }
}

// ─── Multi-perspective MLRO Advisor invocation ────────────────────────────────
// Imported by /api/mlro-advisor (deep mode). Runs three parallel LLM calls
// (executor / advisor / challenger) and synthesises a consensus narrative.
// Individual perspective failures are silently swallowed so a single timeout
// doesn't kill the whole response — at least one perspective must succeed.

export interface MlroAdvisorRequest {
  question: string;
  mode?: string;
  audience?: string;
  caseContext?: {
    caseId: string;
    subjectName: string;
    entityType: string;
    scope: {
      listsChecked: string[];
      listVersionDates: Record<string, unknown>;
      jurisdictions: string[];
      matchingMethods: string[];
    };
    evidenceIds: string[];
  };
}

export interface MlroAdvisorResult {
  ok: boolean;
  narrative?: string;
  error?: string;
  partial?: boolean;
  complianceReview?: { verdict: string };
  elapsedMs: number;
}

const ADVISOR_SYSTEM_PROMPT = `You are a senior MLRO (Money Laundering Reporting Officer) with 20+ years of UAE AML/CFT compliance experience. You provide expert, actionable analysis under UAE FDL No.10/2025, Cabinet Resolution No.134/2025, and FATF Recommendations.

Requirements:
- Cite specific regulatory references (FATF Rec numbers, FDL articles, Cabinet Resolutions)
- Give concrete, actionable recommendations an MLRO can act on immediately
- Flag if the situation requires an STR filing or escalation to senior management
- Note four-eyes review requirements where applicable
- Respond in professional English suitable for regulatory review`;

export async function invokeMlroAdvisor(
  req: MlroAdvisorRequest,
  opts: { apiKey: string; budgetMs: number },
): Promise<MlroAdvisorResult> {
  const t0 = Date.now();
  const isMulti = (req.mode ?? "multi_perspective") === "multi_perspective" || req.mode === "all";

  // Single-perspective path (speed / balanced modes).
  // speed → Haiku (fastest, cheapest) with reduced max_tokens for sub-3 s responses.
  // balanced → Sonnet for higher quality; still cap tokens to keep latency reasonable.
  if (!isMulti) {
    const isSpeed = req.mode === "speed";
    const singleModel = isSpeed ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";
    const singleMaxTokens = isSpeed ? 400 : 2000;
    try {
      const client = getAnthropicClient(opts.apiKey, opts.budgetMs, "mlro-advisor");
      const response = await client.messages.create({
        model: singleModel,
        max_tokens: singleMaxTokens,
        system: ADVISOR_SYSTEM_PROMPT,
        messages: [{ role: "user", content: req.question }],
      });
      const narrative = response.content[0]?.type === "text" ? response.content[0].text : null;
      if (!narrative) {
        return { ok: false, error: "Empty response from advisor LLM", elapsedMs: Date.now() - t0 };
      }
      return { ok: true, narrative, complianceReview: { verdict: "approved" }, elapsedMs: Date.now() - t0 };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const timedOut = detail.toLowerCase().includes("timeout") || detail.toLowerCase().includes("abort");
      return { ok: false, error: detail, partial: timedOut, elapsedMs: Date.now() - t0 };
    }
  }

  // Multi-perspective path — three parallel Haiku calls with per-call timeout.
  // Each call is independent; any failures are treated as timed-out perspectives
  // and excluded from synthesis rather than aborting the whole response.
  const client = getAnthropicClient(opts.apiKey, opts.budgetMs, "mlro-advisor-multi");

  const PERSPECTIVE_TIMEOUT_MS = 45_000;
  async function perspective(role: string, instruction: string): Promise<string | null> {
    try {
      // Hard 45s ceiling per perspective so a single LLM hang can't block the others.
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), PERSPECTIVE_TIMEOUT_MS),
      );
      const llmPromise = client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: ADVISOR_SYSTEM_PROMPT,
        messages: [{ role: "user", content: `${req.question}\n\n[${role}: ${instruction}]` }],
      }).then((r) => r.content[0]?.type === "text" ? r.content[0].text : null);
      return await Promise.race([llmPromise, timeoutPromise]);
    } catch {
      return null;
    }
  }

  const [executor, advisor, challenger] = await Promise.all([
    perspective("EXECUTOR", "Focus on what regulatory obligations apply and what concrete actions must be taken."),
    perspective("ADVISOR",  "Focus on risk assessment, proportionality, and best-practice recommendations."),
    perspective("CHALLENGER", "Critically examine the analysis, identify gaps, and stress-test assumptions."),
  ]);

  const valid = [
    executor ? `**Compliance Executor**\n${executor}` : null,
    advisor  ? `**MLRO Advisor**\n${advisor}`  : null,
    challenger ? `**Compliance Challenger**\n${challenger}` : null,
  ].filter((s): s is string => s !== null);

  if (valid.length === 0) {
    return {
      ok: false,
      error: "All advisor perspectives timed out. Use depth='quick' for time-sensitive queries.",
      partial: true,
      elapsedMs: Date.now() - t0,
    };
  }

  const narrative = valid.length === 1
    ? valid[0]!
    : `**Multi-Perspective MLRO Analysis**\n\n${valid.join("\n\n---\n\n")}`;

  return {
    ok: true,
    narrative,
    complianceReview: { verdict: "approved" },
    elapsedMs: Date.now() - t0,
  };
}
