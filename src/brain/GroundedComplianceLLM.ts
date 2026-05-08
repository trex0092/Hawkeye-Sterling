// Hawkeye Sterling — retrieval-grounded compliance LLM layer.
// Ensures every AI output is grounded in retrieved evidence with mandatory
// citations. Rejects outputs that contain unsupported claims, hallucinated
// sanctions designations, or unverified adverse media.
//
// Regulatory requirement: AI must never assert guilt, legal conclusions,
// or sanctions designations without verified source citations.

// ── Citation system ───────────────────────────────────────────────────────────

export type CitationClass =
  | 'A'   // Primary law / regulation (highest authority)
  | 'B'   // Official regulatory guidance / sanction list
  | 'C'   // Court judgment / tribunal decision
  | 'D'   // Reputable secondary source (T1/T2 media, NGO report)
  | 'E';  // Internal analysis / derived conclusion

export interface Citation {
  citationId: string;
  class: CitationClass;
  sourceId: string;           // e.g. 'ofac_sdn', 'reuters', 'fca'
  sourceName: string;
  title: string;
  url?: string | undefined;
  publishedAt?: string | undefined;
  retrievedAt: string;        // ISO 8601
  relevanceScore: number;     // 0..1 — semantic relevance to the claim
  excerpt: string;            // exact text from the source supporting the claim
}

export interface GroundedClaim {
  claim: string;              // the assertion being made
  citations: Citation[];
  isSupportedByCitations: boolean;
  minimumCitationClass: CitationClass;
  confidence: number;         // 0..1 — weighted by citation class and relevance
  isLegalConclusion: boolean; // legal conclusions require CitationClass A or B
  isGuiltAssertion: boolean;  // guilt assertions are forbidden
}

export interface GroundedOutput {
  outputId: string;
  subject: string;
  query: string;
  claims: GroundedClaim[];
  allCitations: Citation[];
  isValid: boolean;           // false if any claim fails grounding checks
  validationErrors: string[];
  validationWarnings: string[];
  generatedAt: string;
  groundingVersion: string;
}

// ── Policy guardrails ─────────────────────────────────────────────────────────

// Patterns that indicate forbidden assertions
const GUILT_ASSERTION_PATTERNS = [
  /\b(?:is|are|was|were)\s+(?:guilty|a\s+criminal|a\s+terrorist|a\s+money\s+launderer|sanctioned)\b/gi,
  /\bcommitted\s+(?:fraud|money\s+laundering|terrorism|bribery)\b/gi,
  /\bproven\s+(?:to\s+be|guilty)\b/gi,
  /\bconvicted\s+of\b/gi,
];

const LEGAL_CONCLUSION_PATTERNS = [
  /\b(?:violates?|violating|violation\s+of)\s+(?:the\s+)?law\b/gi,
  /\b(?:is|are|was|were)\s+(?:illegal|unlawful|in\s+breach\s+of)\b/gi,
  /\bmust\s+(?:be\s+reported|file\s+a\s+SAR|file\s+an\s+STR)\b/gi,
  /\bconstitutes?\s+(?:money\s+laundering|terrorism|a\s+crime)\b/gi,
];

const UNSUPPORTED_SANCTIONS_PATTERNS = [
  /\b(?:is|are|was|were)\s+(?:sanctioned|designated|on\s+the\s+SDN\s+list)\b/gi,
  /\b(?:OFAC|UN|EU)\s+(?:sanctioned|designated)\b/gi,
  /\blisted\s+(?:on|by)\s+(?:OFAC|the\s+SDN|the\s+UN\s+Consolidated)\b/gi,
];

// ── Citation class weights ────────────────────────────────────────────────────

const CITATION_CLASS_WEIGHTS: Record<CitationClass, number> = {
  A: 1.00,
  B: 0.95,
  C: 0.90,
  D: 0.75,
  E: 0.50,
};

// ── Claim grounding validator ─────────────────────────────────────────────────

export function validateClaimGrounding(claim: GroundedClaim): string[] {
  const errors: string[] = [];

  // 1. Check guilt assertions — forbidden regardless of citations
  if (claim.isGuiltAssertion) {
    errors.push(`Forbidden: guilt assertion detected — "${claim.claim.slice(0, 80)}…". ` +
      `AI must not assert guilt. Use "appears to", "alleged", or "reported by [source]".`);
  }

  // 2. Legal conclusions require Class A or B citation
  if (claim.isLegalConclusion) {
    const hasAuthoritativeCitation = claim.citations.some((c) => c.class === 'A' || c.class === 'B');
    if (!hasAuthoritativeCitation) {
      errors.push(`Legal conclusion requires Class A or B citation: "${claim.claim.slice(0, 80)}…"`);
    }
  }

  // 3. Unsupported claims
  if (!claim.isSupportedByCitations && claim.citations.length === 0) {
    errors.push(`Unsupported claim — no citations provided: "${claim.claim.slice(0, 80)}…"`);
  }

  // 4. Low-confidence claims need higher-class citation
  if (claim.confidence < 0.50 && claim.citations.every((c) => c.class === 'E')) {
    errors.push(`Low-confidence claim with only internal citations — escalate to external source: "${claim.claim.slice(0, 80)}…"`);
  }

  return errors;
}

// ── Hallucination detection ───────────────────────────────────────────────────

export interface HallucinationCheck {
  hasHallucination: boolean;
  detectedPatterns: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export function detectHallucinations(text: string, citations: Citation[]): HallucinationCheck {
  const detected: string[] = [];

  // Check guilt assertions
  for (const pattern of GUILT_ASSERTION_PATTERNS) {
    const matches = text.match(pattern) ?? [];
    for (const m of matches) detected.push(`Guilt assertion: "${m}"`);
  }

  // Check unsupported sanctions claims
  for (const pattern of UNSUPPORTED_SANCTIONS_PATTERNS) {
    const matches = text.match(pattern) ?? [];
    for (const m of matches) {
      // Only flag if not backed by a Class B citation (official sanctions list)
      const hasSanctionsCitation = citations.some((c) => c.class === 'B' && c.sourceId.includes('sanction'));
      if (!hasSanctionsCitation) {
        detected.push(`Unsupported sanctions claim: "${m}"`);
      }
    }
  }

  const severity: HallucinationCheck['severity'] =
    detected.some((d) => d.includes('Guilt')) ? 'critical' :
    detected.some((d) => d.includes('sanctions')) ? 'high' :
    detected.length > 0 ? 'medium' : 'low';

  return {
    hasHallucination: detected.length > 0,
    detectedPatterns: detected,
    severity,
  };
}

// ── Citation builder helpers ──────────────────────────────────────────────────

let _citationCounter = 0;

export function buildCitation(
  sourceId: string,
  sourceName: string,
  citationClass: CitationClass,
  title: string,
  excerpt: string,
  relevanceScore: number,
  url?: string,
  publishedAt?: string,
): Citation {
  _citationCounter++;
  return {
    citationId: `CIT-${Date.now().toString(36).toUpperCase()}-${String(_citationCounter).padStart(4, '0')}`,
    class: citationClass,
    sourceId,
    sourceName,
    title,
    url,
    publishedAt,
    retrievedAt: new Date().toISOString(),
    relevanceScore: Math.min(1, Math.max(0, relevanceScore)),
    excerpt: excerpt.slice(0, 500),
  };
}

// ── Grounded output validator ─────────────────────────────────────────────────

export function validateGroundedOutput(output: GroundedOutput): GroundedOutput {
  const errors: string[] = [...output.validationErrors];
  const warnings: string[] = [...output.validationWarnings];

  // Validate each claim
  for (const claim of output.claims) {
    const claimErrors = validateClaimGrounding(claim);
    errors.push(...claimErrors);
  }

  // Check hallucinations in any free-text claims
  const allClaimText = output.claims.map((c) => c.claim).join('\n');
  const hallucination = detectHallucinations(allClaimText, output.allCitations);
  if (hallucination.hasHallucination) {
    for (const pattern of hallucination.detectedPatterns) {
      if (hallucination.severity === 'critical' || hallucination.severity === 'high') {
        errors.push(`Hallucination detected [${hallucination.severity}]: ${pattern}`);
      } else {
        warnings.push(`Potential hallucination [${hallucination.severity}]: ${pattern}`);
      }
    }
  }

  // Check citation coverage
  if (output.allCitations.length === 0) {
    warnings.push('No citations provided — output cannot be verified; treat as provisional');
  }

  const classACitations = output.allCitations.filter((c) => c.class === 'A' || c.class === 'B');
  if (output.claims.some((c) => c.isLegalConclusion) && classACitations.length === 0) {
    errors.push('Legal conclusions present but no Class A or B citations provided');
  }

  return {
    ...output,
    isValid: errors.length === 0,
    validationErrors: errors,
    validationWarnings: warnings,
  };
}

// ── Grounded output builder ───────────────────────────────────────────────────

let _outputCounter = 0;

export function buildGroundedOutput(
  subject: string,
  query: string,
  claims: GroundedClaim[],
): GroundedOutput {
  _outputCounter++;
  const outputId = `GRD-${Date.now().toString(36).toUpperCase()}-${String(_outputCounter).padStart(4, '0')}`;

  const allCitations = [...new Map(
    claims.flatMap((c) => c.citations).map((c) => [c.citationId, c])
  ).values()];

  const raw: GroundedOutput = {
    outputId,
    subject,
    query,
    claims,
    allCitations,
    isValid: true,
    validationErrors: [],
    validationWarnings: [],
    generatedAt: new Date().toISOString(),
    groundingVersion: '2025.1',
  };

  return validateGroundedOutput(raw);
}

// ── Claim factory helpers ─────────────────────────────────────────────────────

export function buildClaim(
  claim: string,
  citations: Citation[],
  options?: {
    isLegalConclusion?: boolean;
    isGuiltAssertion?: boolean;
  },
): GroundedClaim {
  const isSupportedByCitations = citations.length > 0 &&
    citations.some((c) => c.relevanceScore >= 0.50);

  const minimumClass = citations.reduce<CitationClass>((best, c) => {
    const order: CitationClass[] = ['A', 'B', 'C', 'D', 'E'];
    return order.indexOf(c.class) < order.indexOf(best) ? c.class : best;
  }, 'E');

  const confidence = citations.length === 0 ? 0 :
    citations.reduce((sum, c) => sum + c.relevanceScore * (CITATION_CLASS_WEIGHTS[c.class] ?? 0.5), 0) /
    citations.length;

  const isGuiltAssertion = options?.isGuiltAssertion ??
    GUILT_ASSERTION_PATTERNS.some((p) => p.test(claim));

  const isLegalConclusion = options?.isLegalConclusion ??
    LEGAL_CONCLUSION_PATTERNS.some((p) => p.test(claim));

  return {
    claim,
    citations,
    isSupportedByCitations,
    minimumCitationClass: minimumClass,
    confidence: Math.min(1, confidence),
    isLegalConclusion,
    isGuiltAssertion,
  };
}
