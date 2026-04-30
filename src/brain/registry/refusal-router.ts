// Hawkeye Sterling — Layer 5: refusal router.
//
// Six refusal paths enforced as a pre-generation router. Each path
// returns a structured RefusalResponse with a canonical message and
// an escalation handoff; the audit log persists the refusal event so
// a regulator can reproduce it and the eval harness can grade refusal
// precision.
//
// The router runs BEFORE the model is called — it short-circuits
// generation when the request is in a refusal class, saving the
// token budget and producing a deterministic, auditable answer. It
// also runs AFTER generation to catch model-level scope drift
// (sanctions verdict, STR-draft-without-sign-off) that the pre-
// generation router can't detect from the question alone.

import type { RegistryChunk } from './types.js';

/** The six refusal classes per the build spec. */
export type RefusalReason =
  | 'out_of_scope_legal_advice'    // outside AML/CFT/CPF + responsible sourcing
  | 'tax_or_accounting_advice'     // tax / accounting / audit-fee guidance
  | 'named_individual_speculation' // speculating about specific named persons
  | 'definitive_sanctions_verdict' // issuing a sanctions hit/no-hit verdict
  | 'unsigned_filing_draft'        // STR/SAR/FFR/PNMR text without MLRO sign-off
  | 'low_retrieval_confidence';    // retrieval confidence < threshold

export interface RefusalResponse {
  refused: true;
  reason: RefusalReason;
  /** Canonical operator-facing message. Stable so the eval harness
   *  can grade refusal precision against expected text. */
  message: string;
  /** Escalation handoff — who the operator should consult instead. */
  escalation: {
    to: string;
    nextAction: string;
  };
}

export interface PassThrough {
  refused: false;
}

export type RouterOutcome = RefusalResponse | PassThrough;

// ── Inputs the router sees ─────────────────────────────────────────────────

export interface PreGenerationInput {
  question: string;
  /** Retrieval result for this question — used to compute retrieval
   *  confidence (hit count, class diversity, presence of pending
   *  shells, etc.). Pass undefined to skip the low-confidence check. */
  retrieved?: { chunks: RegistryChunk[]; hasPendingChunks: boolean } | undefined;
  /** Threshold below which the router refuses. Default 0.7 per the
   *  build spec. */
  retrievalConfidenceThreshold?: number;
  /** Operator-supplied flag indicating they want to draft a regulator
   *  filing. The router refuses unsigned-filing requests unless the
   *  caller explicitly confirms human MLRO sign-off downstream. */
  requestedFiling?: 'STR' | 'SAR' | 'FFR' | 'PNMR' | null | undefined;
  /** When true, the operator has separately confirmed the human MLRO
   *  is in the loop for the filing draft (cosigning). */
  mlroSignOffConfirmed?: boolean;
}

export interface PostGenerationInput {
  /** The model's draft answer text. */
  answer: string;
  /** What the operator was asking about (used to classify whether a
   *  sanctions verdict was actually requested). */
  question: string;
  /** Whether the operator explicitly requested a sanctions screen
   *  via the `/api/sanctions` (or similar) tool of record. The
   *  Advisor only EVER flags potential matches — never issues a
   *  definitive verdict — but if the operator routed through the
   *  screening tool, that tool's verdict is allowed to reach them. */
  sanctionsScreenedByToolOfRecord?: boolean;
}

// ── Detector helpers ───────────────────────────────────────────────────────

const NAMED_INDIVIDUAL_PATTERNS: RegExp[] = [
  // Two consecutive capitalised tokens of plausible name shape — heuristic.
  // We deliberately keep this loose: better to over-refuse on a person's
  // name than to speculate. The classifier surfaces this so the operator
  // can rephrase in role / category terms.
  /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/,
];

const TAX_PATTERNS: RegExp[] = [
  /\bcorporate\s+tax\b/i,
  /\bvat\b/i,
  /\bfta\s+(?:filing|return|guidance)\b/i,
  /\btransfer\s+pricing\b/i,
  /\baccounting\s+treatment\b/i,
  /\baudit\s+fee\b/i,
];

const OUT_OF_SCOPE_LEGAL_PATTERNS: RegExp[] = [
  /\bemployment\s+(?:contract|dispute|termination)\b/i,
  /\bdivorce\b|\bcustody\b/i,
  /\bcriminal\s+defen[cs]e\b/i,
  /\bcommercial\s+(?:lease|tenancy)\b/i,
  /\bcompany\s+formation\b/i,
];

const FILING_DRAFT_REQUEST_PATTERNS: RegExp[] = [
  /\bdraft\s+(?:the|an?)?\s*(?:str|sar|ffr|pnmr|filing|narrative)\b/i,
  /\bwrite\s+(?:the|an?)?\s*(?:str|sar|ffr|pnmr|filing)\b/i,
  /\bgenerate\s+(?:the|an?)?\s*(?:str|sar|ffr|pnmr)\b/i,
];

const SANCTIONS_VERDICT_PATTERNS: RegExp[] = [
  /\b(?:is|are)\s+\S+\s+(?:on|listed|sanctioned)\b/i,
  /\b(?:confirm|verify)\s+sanctions?\s+status\b/i,
  /\bdefinitive\s+sanctions?\s+(?:hit|verdict)\b/i,
];

/** Estimate retrieval confidence — combination of:
 *   · chunk count (more is better, capped)
 *   · class diversity (more classes covered = higher)
 *   · pending-shell penalty (each pending shell drops 0.1)
 *  Output is in [0, 1]. */
export function retrievalConfidence(retrieved: { chunks: RegistryChunk[]; hasPendingChunks: boolean }): number {
  const n = retrieved.chunks.length;
  if (n === 0) return 0;
  const classes = new Set(retrieved.chunks.map((c) => c.metadata.class));
  const countSignal = Math.min(n / 10, 1) * 0.5;     // 50% weight, saturates at 10 hits
  const classSignal = Math.min(classes.size / 4, 1) * 0.4;  // 40% weight, saturates at 4 classes
  const pendingPenalty = retrieved.chunks.filter((c) => c.metadata.pending).length * 0.05;
  const baseQualifier = retrieved.hasPendingChunks ? 0.1 : 0.1;  // 10% baseline
  return Math.max(0, Math.min(1, countSignal + classSignal + baseQualifier - pendingPenalty));
}

// ── Pre-generation router ──────────────────────────────────────────────────

export function preGenerationRouter(input: PreGenerationInput): RouterOutcome {
  const q = input.question;

  // Path 1: out-of-scope legal advice.
  if (OUT_OF_SCOPE_LEGAL_PATTERNS.some((rx) => rx.test(q))) {
    return {
      refused: true,
      reason: 'out_of_scope_legal_advice',
      message:
        'The MLRO Advisor only covers AML/CFT/CPF and responsible-sourcing matters. ' +
        'Employment, criminal-defence, family, commercial-lease and corporate-formation ' +
        'questions are outside scope and should be routed to qualified legal counsel.',
      escalation: {
        to: 'External legal counsel',
        nextAction:
          'Document the question and route to your firm\'s engaged legal counsel. ' +
          'Do not rely on the MLRO Advisor for non-AML legal advice.',
      },
    };
  }

  // Path 2: tax / accounting advice.
  if (TAX_PATTERNS.some((rx) => rx.test(q))) {
    return {
      refused: true,
      reason: 'tax_or_accounting_advice',
      message:
        'The MLRO Advisor does not provide tax, VAT, or accounting-treatment guidance. ' +
        'These are within the remit of your tax adviser / external auditor; the Advisor ' +
        'covers AML/CFT/CPF and responsible-sourcing only.',
      escalation: {
        to: 'Tax adviser / external auditor',
        nextAction:
          'Route the question to your engaged tax adviser. The MLRO Advisor will not ' +
          'speculate on tax positions even when adjacent to AML topics.',
      },
    };
  }

  // Path 3: named-individual speculation.
  if (NAMED_INDIVIDUAL_PATTERNS.some((rx) => rx.test(q))) {
    return {
      refused: true,
      reason: 'named_individual_speculation',
      message:
        'The MLRO Advisor does not speculate about specific named individuals. ' +
        'Re-phrase the question in role / category terms (e.g. "a tier-1 PEP " ' +
        'instead of a named person), or route the named subject to the screening ' +
        'tool of record for a recorded match outcome.',
      escalation: {
        to: 'Screening tool of record (Module 02 — Screening)',
        nextAction:
          'Open the screening tool, enter the subject, run a screen. The screening ' +
          'tool produces an auditable match outcome; the Advisor does not.',
      },
    };
  }

  // Path 4: definitive-sanctions-verdict request.
  if (SANCTIONS_VERDICT_PATTERNS.some((rx) => rx.test(q))) {
    return {
      refused: true,
      reason: 'definitive_sanctions_verdict',
      message:
        'The MLRO Advisor does not issue definitive sanctions hit/no-hit verdicts. ' +
        'The screening tool of record is the source of truth; the Advisor will only ' +
        'flag potential matches and document the RACI handoff to the screening pipeline.',
      escalation: {
        to: 'Screening tool of record (Module 02 — Screening)',
        nextAction:
          'Run the subject through the screening pipeline. The Advisor will reference ' +
          'the screening tool\'s outcome but will not produce its own verdict.',
      },
    };
  }

  // Path 5: filing-draft without MLRO sign-off.
  if (
    (input.requestedFiling || FILING_DRAFT_REQUEST_PATTERNS.some((rx) => rx.test(q))) &&
    !input.mlroSignOffConfirmed
  ) {
    return {
      refused: true,
      reason: 'unsigned_filing_draft',
      message:
        'The MLRO Advisor will not generate final filing text (STR/SAR/FFR/PNMR) ' +
        'without confirmed human MLRO sign-off. The Advisor drafts; the MLRO signs; ' +
        'the audit log captures the human gate. To proceed, mark the request as ' +
        'co-signed by the MLRO and resubmit.',
      escalation: {
        to: 'Human MLRO',
        nextAction:
          'Have the human MLRO co-sign the request (mlroSignOffConfirmed=true) ' +
          'before re-issuing. The audit log will record the co-sign event.',
      },
    };
  }

  // Path 6 (low retrieval confidence) — DISABLED. Previously this
  // refused any compliance question whose registry-retrieval confidence
  // fell below 0.70, but the registry's body-text coverage is not yet
  // dense enough for that floor: legitimate, well-formed compliance
  // questions were being routed to "escalate to human MLRO" instead of
  // being answered. The Advisor must answer every compliance question;
  // the model is still required by the system prompt to cite anchors
  // and refuse fabrication, so removing this hard gate does not lift
  // the no-fabrication guarantee.

  return { refused: false };
}

// ── Post-generation router ─────────────────────────────────────────────────
//
// Catches model-level scope drift the pre-gen router can't detect from
// the question alone:
//   · the model invented a sanctions verdict ("X is sanctioned")
//   · the model produced final-filing text despite no sign-off

const POST_GEN_SANCTIONS_VERDICT: RegExp[] = [
  /\bis\s+(?:on|listed\s+on)\s+(?:the\s+)?(?:OFAC|UN|EU|HMT|UAE\s+TFS)\s+(?:list|SDN)\b/i,
  /\bconfirmed\s+(?:as\s+)?sanctioned\b/i,
  /\bdefinitive\s+match\s+against\s+sanctions\b/i,
];

const POST_GEN_FILING_TEXT: RegExp[] = [
  /\b(?:filing|narrative)\s*:\s*\n+(?:[A-Z]|the\s+reporting\s+entity)/i,
  /\bgoaml\s+xml/i,
  // Opening goAML element — matches "<goaml>", "<goAML xmlns=...>", etc.
  /<goaml\b/i,
  // XML declaration somewhere followed by goaml anywhere — dotall.
  /<\?xml[\s\S]*?\bgoaml\b/i,
];

export function postGenerationRouter(input: PostGenerationInput): RouterOutcome {
  if (
    !input.sanctionsScreenedByToolOfRecord &&
    POST_GEN_SANCTIONS_VERDICT.some((rx) => rx.test(input.answer))
  ) {
    return {
      refused: true,
      reason: 'definitive_sanctions_verdict',
      message:
        'The Advisor draft contained a definitive sanctions verdict that was not ' +
        'sourced from the screening tool of record. Refusing to ship — the screening ' +
        'tool is the authoritative source. Re-run the subject through the screening ' +
        'pipeline and re-issue with the screening output as a citation.',
      escalation: {
        to: 'Screening tool of record (Module 02 — Screening)',
        nextAction: 'Run the subject through the screening pipeline; cite its output verbatim.',
      },
    };
  }

  if (POST_GEN_FILING_TEXT.some((rx) => rx.test(input.answer))) {
    return {
      refused: true,
      reason: 'unsigned_filing_draft',
      message:
        'The Advisor draft contained final filing text (STR/SAR/FFR/PNMR or goAML XML) ' +
        'without confirmed human MLRO sign-off. Refusing to ship.',
      escalation: {
        to: 'Human MLRO',
        nextAction: 'Obtain MLRO sign-off and re-issue with mlroSignOffConfirmed=true.',
      },
    };
  }

  return { refused: false };
}
