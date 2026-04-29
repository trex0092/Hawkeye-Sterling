// Hawkeye Sterling — registry public surface.
//
// Layer 1 of the regulator-grade MLRO Advisor build. The registry is
// the foundation: every claim the Advisor renders must trace back to
// a chunk surfaced by `retrieve()`, and every chunk carries class /
// source / article / version / contentHash metadata.

export { CLASS_LABEL } from './types.js';
export type {
  CitationClass,
  ChunkMetadata,
  RegistryChunk,
  RegistrySnapshot,
  RetrievalQuery,
  RetrievalResult,
  SubjectTag,
} from './types.js';

export { RegistryStore, chunkId, hashChunkText, normaliseForHash } from './store.js';
export type { ChunkInput } from './store.js';

export { applyTaxonomicGuard, shouldSuppress } from './taxonomic-guard.js';
export type { GuardOutcome } from './taxonomic-guard.js';

export { retrieve } from './retriever.js';

export { buildSeedRegistry, _resetSeedRegistryForTests } from './seed-catalogue.js';

export { parseCitations, validateCitations } from './citation-validator.js';
export type {
  ParsedCitation,
  CitationDefect,
  UngroundedClaim,
  ValidationReport,
} from './citation-validator.js';

export { checkCompletion, buildFailClosed, SECTION_IDS } from './response-schema.js';

export { AuditLogStore, persistedSourceFromChunk } from './audit-log.js';
export type {
  AuditEntryV1,
  AuditEntryInput,
  AuditQuery,
  AuditQueryResult,
  AdvisorMode,
  ModelBuildHashes,
  ReasoningTurn,
  PersistedSource,
  UserFeedback,
} from './audit-log.js';
export type {
  AdvisorResponseV1,
  Verdict,
  ConfidenceScore,
  FactsSection,
  RedFlagsSection,
  FrameworkCitationsSection,
  DecisionSection,
  ConfidenceSection,
  CounterArgumentSection,
  AuditTrailSection,
  EscalationPathSection,
  CompletionDefect,
  CompletionResult,
  FailClosedResponse,
  SectionId,
} from './response-schema.js';
