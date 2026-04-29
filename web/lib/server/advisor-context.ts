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
