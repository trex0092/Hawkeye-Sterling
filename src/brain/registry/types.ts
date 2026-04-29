// Hawkeye Sterling — source-of-truth registry types.
//
// The registry is the foundation of the regulator-grade MLRO Advisor:
// every claim the Advisor renders must trace back to a registry chunk
// whose class, source, article reference, version, and content hash
// were captured at ingestion time. The retrieval layer never returns a
// chunk without this metadata — the citation discipline layer (the next
// layer in the build) refuses any output whose cited references don't
// match a chunk in the current retrieval set.
//
// Five citation classes, strictly separated:
//
//   A — Primary Law (controlling Arabic, English as parallel reference)
//       e.g. Federal Decree-Law No. 10 of 2025
//   B — Executive Regulations (implementing the Decree-Law)
//       e.g. Cabinet Decision No. 134 of 2025 (effective 14 Dec 2025)
//   C — UAE FIU Operational Guidance (goAML manual, sector circulars,
//       red-flag indicator catalogue)
//   D — International Standards (FATF 40 Recs, Wolfsberg, LBMA RGG,
//       OECD DDG, UN/OFAC/HMT/EU sanctions instruments)
//   E — Reserved for internal entity doctrine (Compliance Manual,
//       EWRA, BWRA, RACI, etc.). Not populated in this layer.

/** The five citation classes. */
export type CitationClass = 'A' | 'B' | 'C' | 'D' | 'E';

/** Human-readable class labels — the retrieval layer surfaces these
 *  alongside every chunk so a downstream consumer can render the
 *  provenance without re-deriving it. */
export const CLASS_LABEL: Record<CitationClass, string> = {
  A: 'Primary Law',
  B: 'Executive Regulations',
  C: 'UAE FIU Operational Guidance',
  D: 'International Standards',
  E: 'Internal Entity Doctrine',
};

/** Subject-matter tags used by the taxonomic guard at the retriever.
 *  The guard refuses to return chunks tagged with an excluded subject
 *  when the query signals a mutually-exclusive subject (e.g. a gold
 *  query never sees Kimberley Process chunks). */
export type SubjectTag =
  | 'gold'
  | 'diamond'
  | 'lbma'
  | 'kimberley'
  | 'dpms'
  | 'precious_metals'
  | 'precious_stones'
  | 'fiat'
  | 'crypto'
  | 'vasp'
  | 'real_estate'
  | 'corporate'
  | 'wire_transfer'
  | 'cross_border_cash'
  | 'sanctions'
  | 'pep'
  | 'cdd'
  | 'edd'
  | 'str_sar'
  | 'recordkeeping'
  | 'tipping_off'
  | 'mlro_appointment'
  | 'fiu_filing'
  | 'cahra'
  | 'general';

/** Per-chunk metadata. Every field is required to be set or
 *  explicitly null at ingestion time — the retriever refuses to
 *  surface a chunk with missing class, source, version, or hash. */
export interface ChunkMetadata {
  class: CitationClass;
  classLabel: string;
  /** Stable identifier for the source document, e.g. 'FDL-10-2025',
   *  'CD-134-2025', 'FATF-R10', 'LBMA-RGG-v9'. The citation validator
   *  in Layer 2 keys off this. */
  sourceId: string;
  /** Human-readable source title for UI / audit-log display. */
  sourceTitle: string;
  /** Article reference in canonical short form, e.g. 'Art.16',
   *  'Art.18 Cl.2', 'R.10', 'Step 4'. Empty for chunks that don't
   *  belong to a numbered structure. */
  articleRef: string;
  articleNumber?: number;
  clauseNumber?: number;
  paragraphNumber?: number;
  /** Document version. For primary law / regulations, the gazette
   *  date; for FATF Recs, the revision year; for LBMA, the version
   *  number. Always present. */
  version: string;
  /** ISO 8601 date the version was promulgated / published. */
  versionDate?: string;
  /** ISO 8601 timestamp of when this chunk entered the registry. */
  ingestedAt: string;
  /** Language of the canonical text. For FDL 10/2025 the Arabic
   *  text is controlling and English is parallel reference. */
  language?: 'ar' | 'en';
  /** True iff this is the controlling-language version. The Advisor
   *  surfaces a warning when controlling-vs-reference contradict. */
  controlling?: boolean;
  /** SHA-256 of the canonical (NFC-normalised, trimmed) text content.
   *  Used to detect silent edits and to verify the chain integrity. */
  contentHash: string;
  /** Subject tags for the taxonomic guard. */
  subjectTags: SubjectTag[];
  /** True iff content is a placeholder pending real-document
   *  ingestion. Placeholder chunks carry the verified citation shell
   *  (class, source, article number, version) but flag the consumer
   *  that the body text has not yet been uploaded. The retrieval
   *  layer surfaces this so the Advisor can refuse to claim an
   *  article it has only the shell of. */
  pending: boolean;
}

/** A registry chunk — an article-sized excerpt of a regulatory
 *  source plus its provenance metadata. */
export interface RegistryChunk {
  /** Deterministic id derived from sourceId + articleRef. */
  id: string;
  /** The canonical text. For pending chunks this is a placeholder
   *  banner string; consumers must check `metadata.pending`. */
  text: string;
  /** Optional parallel-language text. For FDL 10/2025 the controlling
   *  Arabic and reference English are stored side-by-side so the
   *  Advisor can flag contradictions. */
  parallel?: { language: 'ar' | 'en'; text: string };
  metadata: ChunkMetadata;
}

/** A retrieval query. The retriever is intentionally simple — token /
 *  signal matching against tags and references — because the full
 *  semantic relevance ranking lives in the Advisor's prompt-time
 *  classifier. The registry's only job is to surface every CHUNK that
 *  could plausibly anchor a claim, with class metadata intact. */
export interface RetrievalQuery {
  /** Free-text query (the operator's question, possibly enriched with
   *  the rule-based classifier's output). */
  text: string;
  /** Optional class filter — if absent, all five classes are
   *  candidates. The Advisor's input gate uses this to enforce
   *  "STR question must surface Class A + B + C, not just D". */
  classes?: CitationClass[];
  /** Optional explicit source-id filter — when the operator already
   *  knows the cite they want to verify. */
  sourceIds?: string[];
  /** Maximum chunks to return (after taxonomic-guard filtering). */
  topK?: number;
}

/** A retrieval result. Carries the chunks AND the audit trail of what
 *  the taxonomic guard excluded — the audit log persists this so a
 *  reviewer can see what was filtered out and why. */
export interface RetrievalResult {
  chunks: RegistryChunk[];
  /** Chunks the taxonomic guard suppressed, with reason. */
  excluded: Array<{ chunk: RegistryChunk; reason: string }>;
  /** Human-readable trace of every guard rule that fired. */
  taxonomicGuardActions: string[];
  /** True iff at least one returned chunk is a pending (content-not-
   *  yet-ingested) shell. The Advisor renders this as a warning
   *  rather than claiming the article. */
  hasPendingChunks: boolean;
}

/** A full registry export — used by the audit log and the ingestion
 *  CLI. */
export interface RegistrySnapshot {
  schemaVersion: 1;
  generatedAt: string;
  /** SHA-256 over the JSON-serialised, sorted chunk list — the
   *  registry's own content hash. Mismatch on disk indicates a
   *  tampered file. */
  registryHash: string;
  chunks: RegistryChunk[];
}
