// Hawkeye Sterling — registry store.
//
// Append-only, content-hashed chunk store. New chunks are deduped by
// id; re-ingesting the same article-ref under a new version creates a
// new chunk with a distinct id (sourceId + articleRef + version), so
// the audit log can resolve which exact version was in force at the
// time of any past decision (the "version every directive" rule from
// the build spec). The previous version is retained — never overwritten.
//
// The store does NOT persist to disk on its own. The ingestion CLI
// in scripts/registry-ingest.mjs writes a snapshot JSON to
// data/registry/registry.json after a build run; the runtime registry
// loads from that snapshot at module-init time. This keeps the brain
// pure and testable while still giving the CLI a durable artefact.

import { sha256hex } from '../audit-chain.js';
import { CLASS_LABEL, type CitationClass, type ChunkMetadata, type RegistryChunk, type RegistrySnapshot, type SubjectTag } from './types.js';

/** Build a deterministic chunk id from the canonical citation fields.
 *  Same id → same logical article in the same version. */
export function chunkId(sourceId: string, articleRef: string, version: string): string {
  const canonical = `${sourceId}|${articleRef}|${version}`.replace(/\s+/g, '_');
  return canonical;
}

/** Normalise text for content-hashing. NFC + collapse whitespace +
 *  strip BOM. Hash is over the normalised form so trivial whitespace
 *  edits don't break the chain, but semantic edits do. */
export function normaliseForHash(text: string): string {
  return text
    .normalize('NFC')
    .replace(/^﻿/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compute the content hash for a chunk's text. */
export function hashChunkText(text: string): string {
  return sha256hex(normaliseForHash(text));
}

/** Inputs to register a new chunk. The store fills in `contentHash`,
 *  `classLabel`, `ingestedAt`, and `id` deterministically. */
export interface ChunkInput {
  class: CitationClass;
  sourceId: string;
  sourceTitle: string;
  articleRef: string;
  articleNumber?: number;
  clauseNumber?: number;
  paragraphNumber?: number;
  version: string;
  versionDate?: string;
  language?: 'ar' | 'en';
  controlling?: boolean;
  subjectTags: SubjectTag[];
  /** Body text. Pass the placeholder banner string for a metadata-only
   *  shell; pass actual ingested content for a populated chunk. */
  text: string;
  /** Optional parallel text for bilingual sources (FDL 10/2025 ar/en). */
  parallel?: { language: 'ar' | 'en'; text: string };
  /** Set true for metadata-only shells where the body is a placeholder
   *  pending real-document ingestion. */
  pending: boolean;
}

const PLACEHOLDER_BANNER =
  '[REGISTRY: content not yet ingested. Run npm run registry:ingest with the controlling source document. ' +
  'Citation shell (class, source, article, version) is verified; body text is intentionally absent until ingestion.]';

export class RegistryStore {
  private readonly chunks = new Map<string, RegistryChunk>();

  /** Append a new chunk. If a chunk with the same id already exists,
   *  the call is rejected (use a new version to amend). Returns the
   *  registered chunk. */
  add(input: ChunkInput): RegistryChunk {
    const id = chunkId(input.sourceId, input.articleRef, input.version);
    if (this.chunks.has(id)) {
      throw new Error(`registry: chunk already registered: ${id}. Use a new version to amend.`);
    }
    const text = input.pending && !input.text ? PLACEHOLDER_BANNER : input.text;
    const meta: ChunkMetadata = {
      class: input.class,
      classLabel: CLASS_LABEL[input.class],
      sourceId: input.sourceId,
      sourceTitle: input.sourceTitle,
      articleRef: input.articleRef,
      ...(input.articleNumber !== undefined ? { articleNumber: input.articleNumber } : {}),
      ...(input.clauseNumber !== undefined ? { clauseNumber: input.clauseNumber } : {}),
      ...(input.paragraphNumber !== undefined ? { paragraphNumber: input.paragraphNumber } : {}),
      version: input.version,
      ...(input.versionDate !== undefined ? { versionDate: input.versionDate } : {}),
      ingestedAt: new Date().toISOString(),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.controlling !== undefined ? { controlling: input.controlling } : {}),
      contentHash: hashChunkText(text),
      subjectTags: [...input.subjectTags],
      pending: input.pending,
    };
    const chunk: RegistryChunk = {
      id,
      text,
      ...(input.parallel ? { parallel: { language: input.parallel.language, text: input.parallel.text } } : {}),
      metadata: meta,
    };
    this.chunks.set(id, chunk);
    return chunk;
  }

  has(id: string): boolean {
    return this.chunks.has(id);
  }

  get(id: string): RegistryChunk | undefined {
    return this.chunks.get(id);
  }

  /** All registered chunks, ordered by id (deterministic). */
  list(): RegistryChunk[] {
    return [...this.chunks.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Filter helpers used by the retriever. */
  byClass(c: CitationClass): RegistryChunk[] {
    return this.list().filter((ch) => ch.metadata.class === c);
  }

  bySource(sourceId: string): RegistryChunk[] {
    return this.list().filter((ch) => ch.metadata.sourceId === sourceId);
  }

  /** Total count — used by the audit-log for snapshot integrity. */
  size(): number {
    return this.chunks.size;
  }

  /** Materialise a snapshot. The snapshot's own hash covers the sorted
   *  chunk list — any silent edit to the on-disk JSON breaks this. */
  snapshot(): RegistrySnapshot {
    const chunks = this.list();
    const stable = JSON.stringify(chunks);
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      registryHash: sha256hex(stable),
      chunks,
    };
  }

  /** Rehydrate from a snapshot. Verifies the registry hash; throws on
   *  mismatch. */
  static fromSnapshot(snap: RegistrySnapshot): RegistryStore {
    const expected = sha256hex(JSON.stringify(snap.chunks));
    if (snap.registryHash !== expected) {
      throw new Error('registry: snapshot hash mismatch — file has been tampered with or corrupted.');
    }
    const store = new RegistryStore();
    for (const chunk of snap.chunks) store.chunks.set(chunk.id, chunk);
    return store;
  }
}
