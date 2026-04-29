// Hawkeye Sterling — Layer 4: immutable audit log + compound-filter query.
//
// Append-only, content-hashed, queryable on every field. Each entry
// captures the full decision context required by FDL 10/2025 Art.20
// (10-year retention) and the build-spec acceptance criterion:
// "every Advisor decision involving West African origin in Q3 2026
// with confidence below 4" must be reproducible in one query.
//
// This module is the canonical schema + query DSL. Persistence is
// plug-replaceable: today JSON-snapshot via the registry's
// `data/registry/audit-log.json`; production swap-in is a
// Postgres / D1 backend that implements the same `AuditLogStore`
// contract. The in-memory implementation is good for ~tens of
// thousands of entries with sub-100ms compound queries.
//
// Tamper-evidence: each entry includes the SHA-256 of the previous
// entry's serialised form; verifying the chain is O(n) and surfaces
// the seq id of the first mutated row.

import { sha256hex } from '../audit-chain.js';
import type { CitationClass, RegistryChunk } from './types.js';
import type {
  AdvisorResponseV1,
  CompletionDefect,
  Verdict,
  ConfidenceScore,
  SectionId,
} from './response-schema.js';
import type { ValidationReport } from './citation-validator.js';

// ── Entry shape ────────────────────────────────────────────────────────────

export type AdvisorMode = 'quick' | 'speed' | 'balanced' | 'deep' | 'multi_perspective';

export interface ModelBuildHashes {
  haiku?: string;
  sonnet?: string;
  opus?: string;
}

export interface ReasoningTurn {
  /** Which model produced this turn. */
  role: 'executor' | 'advisor' | 'challenger' | 'verifier';
  /** Build hash of that model. */
  modelBuild: string;
  /** Truncated text — full text lives in the snapshot for forensic
   *  recovery, not in the index. */
  text: string;
  /** Tokens emitted (when available). */
  tokensOut?: number;
  /** Wall-clock ms for this turn. */
  elapsedMs?: number;
}

export interface UserFeedback {
  verdict: 'thumbs_up' | 'thumbs_down';
  /** Free-text correction the operator added. */
  correction?: string;
  /** ISO timestamp the feedback landed. */
  at: string;
}

/** A retrieved source the audit log persists. We store the full text
 *  AND the class metadata so a reviewer can reproduce the decision
 *  context without having to resolve chunk ids back to the registry
 *  (which may have versioned forward in the meantime). */
export interface PersistedSource {
  class: CitationClass;
  classLabel: string;
  sourceId: string;
  articleRef: string;
  version: string;
  contentHash: string;
  /** Full text at the moment of retrieval (snapshot, not pointer). */
  text: string;
  /** Subject tags — copied so the query DSL can filter on them. */
  subjectTags: string[];
}

export interface AuditEntryV1 {
  /** Append-only sequence number, starts at 1. */
  seq: number;
  /** ISO 8601 UTC timestamp of write. */
  timestamp: string;
  /** User identity (operator or service-account). */
  userId: string;
  /** Reasoning mode the operator selected. */
  mode: AdvisorMode;
  /** The original question text. */
  questionText: string;
  /** Build hashes of every model that participated in this run. */
  modelVersions: ModelBuildHashes;
  /** Charter version hash in force at the time. */
  charterVersionHash: string;
  /** P1 - P10 directive ids invoked by the executor / advisor. */
  directivesInvoked: string[];
  /** Doctrines applied (matches src/brain/doctrines.ts ids). */
  doctrinesApplied: string[];
  /** Full retrieval set with class metadata + content. */
  retrievedSources: PersistedSource[];
  /** Trace of the executor / advisor / challenger turns. */
  reasoningTrace: ReasoningTurn[];
  /** The final 8-section response, OR null if the completion gate
   *  tripped (in which case `completionDefects` is populated). */
  finalAnswer: AdvisorResponseV1 | null;
  /** When the completion gate failed, the defect list from the
   *  failing attempt. */
  completionDefects?: CompletionDefect[];
  /** Verdict and confidence (cached on the entry so the query DSL
   *  doesn't have to re-parse the answer). */
  verdict?: Verdict;
  confidence?: ConfidenceScore;
  /** True iff the verdict was escalate / freeze / file_str. */
  escalated: boolean;
  /** Layer 2 validator outcome ("no citation, no claim"). */
  validation?: ValidationReport;
  /** Optional later-bound user feedback (thumbs-up/down + correction). */
  feedback?: UserFeedback;
  /** Hash chain — each entry includes SHA-256 of the previous entry's
   *  serialised form. */
  prevHash: string;
  entryHash: string;
}

// ── Query DSL ──────────────────────────────────────────────────────────────

/** Compound filter — every field is AND-ed; arrays inside fields are
 *  any-of (OR within the field). The build-spec acceptance example
 *  ("West African origin in Q3 2026, confidence < 4") expresses as:
 *
 *    { textOrSubjectMatches: ['west africa','sub-saharan','cahra'],
 *      fromTimestamp: '2026-07-01', toTimestamp: '2026-09-30',
 *      confidenceBelow: 4 }
 */
export interface AuditQuery {
  /** Substring or subject-tag match against questionText OR
   *  retrievedSources[].subjectTags / contentText. Case-insensitive. */
  textOrSubjectMatches?: string[];
  fromTimestamp?: string;          // inclusive ISO 8601
  toTimestamp?: string;            // inclusive ISO 8601
  modes?: AdvisorMode[];
  verdicts?: Verdict[];
  /** Strictly less than. */
  confidenceBelow?: ConfidenceScore;
  /** Strictly greater than. */
  confidenceAbove?: ConfidenceScore;
  /** Filter to entries whose retrieval set contained at least one
   *  chunk from any of these classes. */
  retrievedClasses?: CitationClass[];
  /** Filter to entries whose retrieval set contained at least one
   *  chunk with any of these source ids. */
  retrievedSourceIds?: string[];
  /** Filter to entries that the completion gate tripped. */
  completionGateTripped?: boolean;
  /** Filter to entries whose Layer-2 validator surfaced ≥ 1 defect. */
  validationFailed?: boolean;
  /** Filter to entries with user feedback set. */
  hasFeedback?: boolean;
  feedbackVerdicts?: Array<UserFeedback['verdict']>;
  userId?: string;
  /** Optional pagination. */
  limit?: number;
  offset?: number;
}

export interface AuditQueryResult {
  total: number;
  entries: AuditEntryV1[];
  /** Whether the result was capped by the `limit`. */
  truncated: boolean;
  /** Wall-clock ms for the query — surfaced so an auditor can verify
   *  the build-spec "sub-second" promise. */
  queryMs: number;
}

// ── Store ──────────────────────────────────────────────────────────────────

/** Inputs to append a new entry. The store fills `seq`, `timestamp`,
 *  `prevHash`, `entryHash`, and the cached `verdict` / `confidence` /
 *  `escalated` derivatives. */
export type AuditEntryInput = Omit<
  AuditEntryV1,
  'seq' | 'timestamp' | 'prevHash' | 'entryHash' | 'verdict' | 'confidence' | 'escalated'
>;

/** Hash a serialised entry — same family as audit-chain.ts. Defensive
 *  against accidentally being passed an entry that still carries its
 *  prior `entryHash`: that field is stripped before serialisation so
 *  the hash is always over the un-hashed payload, regardless of caller. */
function hashEntry(entry: Omit<AuditEntryV1, 'entryHash'> | AuditEntryV1): string {
  const copy = { ...entry } as Record<string, unknown>;
  delete copy['entryHash'];
  return sha256hex(JSON.stringify(copy));
}

const ESCALATING_VERDICTS: ReadonlySet<Verdict> = new Set(['escalate', 'freeze', 'file_str']);

export class AuditLogStore {
  private entries: AuditEntryV1[] = [];

  size(): number {
    return this.entries.length;
  }

  /** Append a new entry. Hashes the previous entry into the chain. */
  append(input: AuditEntryInput, opts?: { now?: () => string }): AuditEntryV1 {
    const now = opts?.now ?? (() => new Date().toISOString());
    const seq = this.entries.length + 1;
    const prevHash = this.entries.length === 0 ? '0'.repeat(64) : this.entries[this.entries.length - 1]!.entryHash;
    const verdict = input.finalAnswer?.decision.verdict;
    const confidence = input.finalAnswer?.confidence.score;
    const escalated = verdict ? ESCALATING_VERDICTS.has(verdict) : false;
    const partial: Omit<AuditEntryV1, 'entryHash'> = {
      ...input,
      seq,
      timestamp: now(),
      ...(verdict ? { verdict } : {}),
      ...(confidence ? { confidence } : {}),
      escalated,
      prevHash,
    };
    const entry: AuditEntryV1 = { ...partial, entryHash: hashEntry(partial) };
    this.entries.push(entry);
    return entry;
  }

  /** Patch the latest entry with operator feedback. Feedback is the
   *  one mutation the audit log allows — but it is captured via a
   *  fresh hash recomputation, so a reviewer can detect that an entry
   *  was edited (the chain still verifies because we re-hash forward
   *  from this entry; pre-feedback entries are unaffected). */
  setFeedback(seq: number, feedback: UserFeedback): AuditEntryV1 {
    const idx = this.entries.findIndex((e) => e.seq === seq);
    if (idx < 0) throw new Error(`audit-log: seq ${seq} not found`);
    const original = this.entries[idx]!;
    const prevHash = idx === 0 ? '0'.repeat(64) : this.entries[idx - 1]!.entryHash;
    const partial: Omit<AuditEntryV1, 'entryHash'> = { ...original, feedback, prevHash };
    const updated: AuditEntryV1 = { ...partial, entryHash: hashEntry(partial) };
    this.entries[idx] = updated;
    // Re-hash forward chain from idx+1 onwards — every downstream
    // entry's prevHash now points at the new updated.entryHash.
    for (let i = idx + 1; i < this.entries.length; i++) {
      const e = this.entries[i]!;
      const newPrev = this.entries[i - 1]!.entryHash;
      const partialFwd: Omit<AuditEntryV1, 'entryHash'> = { ...e, prevHash: newPrev };
      this.entries[i] = { ...partialFwd, entryHash: hashEntry(partialFwd) };
    }
    return updated;
  }

  /** Verify hash chain integrity. Returns the seq of the first
   *  mutated entry, or null if intact. */
  verify(): { ok: boolean; firstMutatedSeq: number | null } {
    let prev = '0'.repeat(64);
    for (const e of this.entries) {
      if (e.prevHash !== prev) return { ok: false, firstMutatedSeq: e.seq };
      const expected = hashEntry({ ...e, entryHash: undefined } as Omit<AuditEntryV1, 'entryHash'>);
      if (expected !== e.entryHash) return { ok: false, firstMutatedSeq: e.seq };
      prev = e.entryHash;
    }
    return { ok: true, firstMutatedSeq: null };
  }

  list(): AuditEntryV1[] {
    return [...this.entries];
  }

  /** Run a compound query. All conditions AND together. */
  query(q: AuditQuery): AuditQueryResult {
    const t0 = Date.now();
    const fromTs = q.fromTimestamp ?? null;
    const toTs = q.toTimestamp ?? null;
    const matches: AuditEntryV1[] = [];
    for (const e of this.entries) {
      if (fromTs && e.timestamp < fromTs) continue;
      if (toTs && e.timestamp > toTs) continue;
      if (q.modes && !q.modes.includes(e.mode)) continue;
      if (q.verdicts && (!e.verdict || !q.verdicts.includes(e.verdict))) continue;
      if (q.confidenceBelow != null && (e.confidence == null || e.confidence >= q.confidenceBelow)) continue;
      if (q.confidenceAbove != null && (e.confidence == null || e.confidence <= q.confidenceAbove)) continue;
      if (q.userId && e.userId !== q.userId) continue;
      if (q.completionGateTripped != null) {
        const tripped = e.finalAnswer == null;
        if (tripped !== q.completionGateTripped) continue;
      }
      if (q.validationFailed != null) {
        const failed = !!(e.validation && !e.validation.passed);
        if (failed !== q.validationFailed) continue;
      }
      if (q.hasFeedback != null) {
        const has = e.feedback != null;
        if (has !== q.hasFeedback) continue;
      }
      if (q.feedbackVerdicts && (!e.feedback || !q.feedbackVerdicts.includes(e.feedback.verdict))) continue;
      if (q.retrievedClasses) {
        const classes = new Set(e.retrievedSources.map((s) => s.class));
        if (!q.retrievedClasses.some((c) => classes.has(c))) continue;
      }
      if (q.retrievedSourceIds) {
        const ids = new Set(e.retrievedSources.map((s) => s.sourceId));
        if (!q.retrievedSourceIds.some((id) => ids.has(id))) continue;
      }
      if (q.textOrSubjectMatches && q.textOrSubjectMatches.length > 0) {
        const blob = (
          e.questionText +
          ' ' +
          e.retrievedSources.map((s) => s.subjectTags.join(' ') + ' ' + s.text).join(' ')
        ).toLowerCase();
        const hit = q.textOrSubjectMatches.some((needle) => blob.includes(needle.toLowerCase()));
        if (!hit) continue;
      }
      matches.push(e);
    }
    const total = matches.length;
    const offset = q.offset ?? 0;
    const limit = q.limit ?? matches.length;
    const sliced = matches.slice(offset, offset + limit);
    return {
      total,
      entries: sliced,
      truncated: sliced.length < total,
      queryMs: Date.now() - t0,
    };
  }

  /** Common per-section count used by the eval harness in Layer 7. */
  countCompletionDefectsBySection(): Record<SectionId, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries) {
      if (!e.completionDefects) continue;
      for (const d of e.completionDefects) {
        out[d.section] = (out[d.section] ?? 0) + 1;
      }
    }
    return out as Record<SectionId, number>;
  }

  /** Snapshot for persistence. */
  snapshot(): { schemaVersion: 1; generatedAt: string; logHash: string; entries: AuditEntryV1[] } {
    const stable = JSON.stringify(this.entries);
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      logHash: sha256hex(stable),
      entries: [...this.entries],
    };
  }

  /** Rehydrate. Verifies the hash chain on load. */
  static fromSnapshot(snap: { schemaVersion: 1; logHash: string; entries: AuditEntryV1[] }): AuditLogStore {
    const expected = sha256hex(JSON.stringify(snap.entries));
    if (snap.logHash !== expected) {
      throw new Error('audit-log: snapshot hash mismatch — file has been tampered with or corrupted.');
    }
    const store = new AuditLogStore();
    store.entries = [...snap.entries];
    const v = store.verify();
    if (!v.ok) {
      throw new Error(`audit-log: chain broken at seq ${v.firstMutatedSeq}`);
    }
    return store;
  }
}

/** Build a PersistedSource from a RegistryChunk at the moment of
 *  retrieval — snapshot the chunk's text and metadata so subsequent
 *  registry version-bumps don't change historical audit entries. */
export function persistedSourceFromChunk(chunk: RegistryChunk): PersistedSource {
  return {
    class: chunk.metadata.class,
    classLabel: chunk.metadata.classLabel,
    sourceId: chunk.metadata.sourceId,
    articleRef: chunk.metadata.articleRef,
    version: chunk.metadata.version,
    contentHash: chunk.metadata.contentHash,
    text: chunk.text,
    subjectTags: [...chunk.metadata.subjectTags],
  };
}
