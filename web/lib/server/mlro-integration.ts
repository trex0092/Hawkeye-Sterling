// MLRO Advisor — Layer 2–5 integration helpers.
//
// Wires the registry layers built in src/brain/registry/ into the live
// /api/mlro-advisor + /api/mlro-advisor-quick route handlers so the
// Advisor's actual generation path enforces:
//
//   · Layer 1 — registry retrieval (class-tagged chunks fed into the prompt)
//   · Layer 2 — citation validator (retrieval-grounded "no citation, no claim")
//   · Layer 5 — pre-generation refusal router (six paths)
//   · Layer 5 — post-generation refusal router (sanctions verdict / filing XML)
//   · Layer 4 — audit-log entry per request (in-memory + Netlify Blobs)
//
// Layer 3 (8-section schema) and Layer 6 (adversarial probe) are
// deferred to a follow-up because they require restructuring the
// prompt and the response shape — separate review surface.

import {
  buildSeedRegistry,
  retrieve,
  retrievalConfidence,
  preGenerationRouter,
  postGenerationRouter,
  validateCitations,
  type RetrievalResult,
  type RegistryChunk,
  type RouterOutcome,
  type ValidationReport,
  type AdvisorMode,
  type ReasoningTurn,
  type PersistedSource,
} from "../../../dist/src/brain/registry/index.js";
import { persistedSourceFromChunk, AuditLogStore } from "../../../dist/src/brain/registry/audit-log.js";
import type { AdvisorResponseV1 } from "../../../dist/src/brain/registry/index.js";
import { setJson, listKeys } from "./store.js";

const REGISTRY = buildSeedRegistry();

/** A single in-process audit log. Survives a Lambda warm container;
 *  every entry is also persisted to Netlify Blobs (or the in-memory
 *  fallback when the Blobs binding is unavailable) so cold-starts
 *  don't lose history. The persistent store is the canonical record;
 *  the in-process store is a write-through cache. */
const PROCESS_LOG = new AuditLogStore();

// ── Retrieval ──────────────────────────────────────────────────────────────

export interface RetrievalContext {
  result: RetrievalResult;
  /** Compact line-formatted summary suitable for inlining into the
   *  Advisor's user prompt — primary topic, jurisdictions, every
   *  retrieved chunk's class + sourceId + articleRef. The Advisor
   *  is instructed to anchor every claim against these references. */
  promptBlock: string;
  /** Cheap retrieval-confidence score in [0, 1]. Layer 5 path 6
   *  refuses when this is below the threshold. */
  confidence: number;
  /** Class-tagged chunks ready to drop into the audit log. */
  persistedSources: PersistedSource[];
}

export function retrieveForQuestion(question: string, topK = 12): RetrievalContext {
  const result = retrieve(REGISTRY, { text: question, topK });
  const confidence = retrievalConfidence({
    chunks: result.chunks,
    hasPendingChunks: result.hasPendingChunks,
  });
  const persistedSources = result.chunks.map(persistedSourceFromChunk);
  const lines: string[] = [];
  lines.push("REGISTRY RETRIEVAL — every claim must trace back to one of these sources:");
  for (const c of result.chunks.slice(0, 8)) {
    const stale = c.metadata.pending ? " [pending — body text not yet ingested; cite shell only]" : "";
    lines.push(
      `  · [Class ${c.metadata.class} — ${c.metadata.classLabel}] ${c.metadata.sourceId} ${c.metadata.articleRef} (v${c.metadata.version})${stale}`,
    );
  }
  if (result.taxonomicGuardActions.length > 0) {
    lines.push("");
    lines.push("Taxonomic guard fired:");
    for (const a of result.taxonomicGuardActions.slice(0, 3)) lines.push(`  · ${a}`);
  }
  return { result, promptBlock: lines.join("\n"), confidence, persistedSources };
}

// ── Pre-generation refusal ────────────────────────────────────────────────

export interface PreGenInput {
  question: string;
  retrieval?: RetrievalContext | undefined;
  retrievalConfidenceThreshold?: number;
  requestedFiling?: "STR" | "SAR" | "FFR" | "PNMR" | null;
  mlroSignOffConfirmed?: boolean;
}

/** Run the Layer 5 pre-generation router. Returns a RouterOutcome that
 *  the caller checks; if `refused`, the caller short-circuits the
 *  Anthropic API call and returns the refusal message verbatim. */
export function runPreGenerationRouter(input: PreGenInput): RouterOutcome {
  const threshold =
    input.retrievalConfidenceThreshold ??
    Number(process.env["MLRO_RETRIEVAL_CONFIDENCE_THRESHOLD"] ?? "0.7");
  return preGenerationRouter({
    question: input.question,
    ...(input.retrieval
      ? {
          retrieved: {
            chunks: input.retrieval.result.chunks,
            hasPendingChunks: input.retrieval.result.hasPendingChunks,
          },
        }
      : {}),
    retrievalConfidenceThreshold: threshold,
    ...(input.requestedFiling !== undefined ? { requestedFiling: input.requestedFiling } : {}),
    ...(input.mlroSignOffConfirmed !== undefined ? { mlroSignOffConfirmed: input.mlroSignOffConfirmed } : {}),
  });
}

// ── Post-generation refusal + citation validation ─────────────────────────

export interface PostGenInput {
  question: string;
  answer: string;
  retrieval: RetrievalContext;
  sanctionsScreenedByToolOfRecord?: boolean;
}

export interface PostGenResult {
  /** The Layer 2 citation-validator outcome — every claim is
   *  matched against the retrieval set; on miss the answer is
   *  flagged but NOT auto-edited (the route handler decides
   *  whether to retry or escalate). */
  validation: ValidationReport;
  /** The Layer 5 post-generation router outcome. When refused,
   *  the route returns the refusal message instead of the answer. */
  router: RouterOutcome;
}

export function runPostGenerationCheck(input: PostGenInput): PostGenResult {
  const validation = validateCitations(input.answer, input.retrieval.result.chunks);
  const router = postGenerationRouter({
    question: input.question,
    answer: input.answer,
    ...(input.sanctionsScreenedByToolOfRecord !== undefined
      ? { sanctionsScreenedByToolOfRecord: input.sanctionsScreenedByToolOfRecord }
      : {}),
  });
  return { validation, router };
}

// ── Audit log persistence ─────────────────────────────────────────────────

const AUDIT_LOG_KEY_PREFIX = "audit-log/mlro-advisor/";

export interface AuditLogAppendInput {
  userId: string;
  mode: AdvisorMode;
  questionText: string;
  modelVersions: { haiku?: string; sonnet?: string; opus?: string };
  charterVersionHash: string;
  directivesInvoked: string[];
  doctrinesApplied: string[];
  retrievedSources: PersistedSource[];
  reasoningTrace: ReasoningTurn[];
  finalAnswer: AdvisorResponseV1 | null;
  validation?: ValidationReport;
  refusalReason?: string;
}

/** Append an audit-log entry. Always writes to the in-process log;
 *  also fires a write-through to Netlify Blobs (best-effort — never
 *  blocks the request on the persistence call). Returns the entry's
 *  seq so the caller can reference it in the response. */
export async function appendAuditEntry(input: AuditLogAppendInput): Promise<{ seq: number; entryHash: string }> {
  const entry = PROCESS_LOG.append({
    userId: input.userId,
    mode: input.mode,
    questionText: input.questionText,
    modelVersions: input.modelVersions,
    charterVersionHash: input.charterVersionHash,
    directivesInvoked: input.directivesInvoked,
    doctrinesApplied: input.doctrinesApplied,
    retrievedSources: input.retrievedSources,
    reasoningTrace: input.reasoningTrace,
    finalAnswer: input.finalAnswer,
    ...(input.validation ? { validation: input.validation } : {}),
  });
  // Fire-and-forget Blobs write. Errors are logged in the store wrapper.
  void setJson(`${AUDIT_LOG_KEY_PREFIX}${entry.seq}`, entry).catch(() => {
    // The store wrapper already logs; nothing to do here.
  });
  return { seq: entry.seq, entryHash: entry.entryHash };
}

/** Read-only accessor for the in-process log — used by the eval-KPI
 *  endpoint and tests. Does not return persisted entries from
 *  earlier processes; use `loadPersistedAuditCount()` for that. */
export function getProcessAuditLog(): AuditLogStore {
  return PROCESS_LOG;
}

/** How many audit entries are persisted in Blobs. Cheap pagination via
 *  prefix-listing; does not load the entries themselves. */
export async function loadPersistedAuditCount(): Promise<number> {
  const keys = await listKeys(AUDIT_LOG_KEY_PREFIX);
  return keys.length;
}

// ── Helper: registry handle for tests / diagnostics ───────────────────────

export function getRegistry() {
  return REGISTRY;
}
