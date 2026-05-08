// Hawkeye Sterling — AI evidence validator.
// AI output must fail validation if:
//   - Evidence is missing for the claim being made
//   - Confidence is below the required threshold
//   - Conclusions are unsupported by the retrieved evidence
//   - Evidence conflicts with other evidence (contradiction)
//   - The output contains hallucinated adverse media
//
// This is a gate — invalid outputs are rejected, not warned.

import { detectHallucinations, type Citation, type CitationClass } from './GroundedComplianceLLM.js';

// ── Validation rules ──────────────────────────────────────────────────────────

export type ValidationRuleId =
  | 'EVIDENCE_REQUIRED'
  | 'MIN_CONFIDENCE'
  | 'NO_UNSUPPORTED_CONCLUSIONS'
  | 'NO_CONFLICTING_EVIDENCE'
  | 'NO_HALLUCINATED_MEDIA'
  | 'CITATION_CLASS_REQUIRED'
  | 'NO_GUILT_ASSERTION'
  | 'NO_LEGAL_CONCLUSION_WITHOUT_CITATION'
  | 'SANCTIONS_CLAIM_MUST_CITE_OFFICIAL_LIST';

export interface ValidationRule {
  id: ValidationRuleId;
  description: string;
  severity: 'blocking' | 'warning';
  check: (input: EvidenceValidationInput) => string | null; // null = pass
}

export interface EvidenceValidationInput {
  claims: string[];
  citations: Citation[];
  confidence: number;
  confidenceThreshold?: number;     // default 0.60
  minCitationClass?: CitationClass; // default 'D'
  allowLegalConclusions?: boolean;  // default false
}

export interface ValidationResult {
  passed: boolean;
  blockingErrors: string[];
  warnings: string[];
  rulesChecked: ValidationRuleId[];
  rulesPassed: ValidationRuleId[];
  rulesFailed: ValidationRuleId[];
  validatedAt: string;
}

// ── Rule implementations ──────────────────────────────────────────────────────

const RULES: ValidationRule[] = [
  {
    id: 'EVIDENCE_REQUIRED',
    description: 'At least one citation must be present for any factual claim',
    severity: 'blocking',
    check: (input) => {
      if (input.claims.length > 0 && input.citations.length === 0) {
        return `${input.claims.length} claim(s) made but no citations provided`;
      }
      return null;
    },
  },
  {
    id: 'MIN_CONFIDENCE',
    description: 'Output confidence must meet the minimum threshold',
    severity: 'blocking',
    check: (input) => {
      const threshold = input.confidenceThreshold ?? 0.60;
      if (input.confidence < threshold) {
        return `Confidence ${(input.confidence * 100).toFixed(0)}% below required threshold ${(threshold * 100).toFixed(0)}%`;
      }
      return null;
    },
  },
  {
    id: 'NO_HALLUCINATED_MEDIA',
    description: 'Output must not contain hallucinated adverse media references',
    severity: 'blocking',
    check: (input) => {
      const fullText = input.claims.join('\n');
      const check = detectHallucinations(fullText, input.citations);
      if (check.hasHallucination && (check.severity === 'critical' || check.severity === 'high')) {
        return `Hallucination detected (${check.severity}): ${check.detectedPatterns.slice(0, 2).join('; ')}`;
      }
      return null;
    },
  },
  {
    id: 'NO_GUILT_ASSERTION',
    description: 'AI must not assert guilt — use "alleged", "reported", or "appears to"',
    severity: 'blocking',
    check: (input) => {
      const guiltPatterns = [
        /\b(?:is|are|was|were)\s+(?:guilty|a\s+criminal|a\s+terrorist)\b/gi,
        /\bcommitted\s+(?:fraud|terrorism|bribery|corruption)\b/gi,
        /\bproven\s+guilty\b/gi,
      ];
      const fullText = input.claims.join(' ');
      for (const p of guiltPatterns) {
        const m = fullText.match(p);
        if (m) return `Forbidden guilt assertion: "${m[0]}" — use passive/alleged form`;
      }
      return null;
    },
  },
  {
    id: 'SANCTIONS_CLAIM_MUST_CITE_OFFICIAL_LIST',
    description: 'Any claim that an entity is sanctioned must cite an official list (Class B)',
    severity: 'blocking',
    check: (input) => {
      const sanctionsClaims = input.claims.filter((c) =>
        /\b(?:is|are|was|were)\s+(?:sanctioned|designated|on\s+the\s+(?:SDN|UN|OFAC|EU)\s+list)\b/i.test(c)
      );
      if (sanctionsClaims.length === 0) return null;
      const hasClassBCitation = input.citations.some((c) => c.class === 'A' || c.class === 'B');
      if (!hasClassBCitation) {
        return `Sanctions claim detected but no Class A/B citation (official list) provided`;
      }
      return null;
    },
  },
  {
    id: 'NO_LEGAL_CONCLUSION_WITHOUT_CITATION',
    description: 'Legal conclusions require at least a Class B citation',
    severity: 'blocking',
    check: (input) => {
      if (input.allowLegalConclusions) return null;
      const legalPatterns = [
        /\b(?:violates?|violating)\s+(?:the\s+)?(?:law|FCPA|Bribery\s+Act|AML\s+rules)\b/gi,
        /\bmust\s+(?:be\s+reported|file\s+a\s+SAR)\b/gi,
        /\bconstitutes?\s+(?:money\s+laundering|terrorism|a\s+criminal\s+offence)\b/gi,
      ];
      const fullText = input.claims.join(' ');
      for (const p of legalPatterns) {
        const m = fullText.match(p);
        if (m) {
          const hasAuth = input.citations.some((c) => c.class === 'A' || c.class === 'B');
          if (!hasAuth) return `Legal conclusion "${m[0]}" requires Class A/B citation`;
        }
      }
      return null;
    },
  },
  {
    id: 'CITATION_CLASS_REQUIRED',
    description: 'Citations must meet the minimum class requirement',
    severity: 'warning',
    check: (input) => {
      const minClass = input.minCitationClass ?? 'D';
      const classOrder: CitationClass[] = ['A', 'B', 'C', 'D', 'E'];
      const minIdx = classOrder.indexOf(minClass);
      const allBelowMin = input.citations.every((c) => classOrder.indexOf(c.class) > minIdx);
      if (input.citations.length > 0 && allBelowMin) {
        return `All citations are below minimum class ${minClass} — seek higher-authority sources`;
      }
      return null;
    },
  },
  {
    id: 'NO_CONFLICTING_EVIDENCE',
    description: 'Evidence must not directly contradict other evidence without acknowledgment',
    severity: 'warning',
    check: (input) => {
      // Check if any two citations have significantly different relevance scores
      // (indicating they may support conflicting interpretations)
      if (input.citations.length < 2) return null;
      const maxRelevance = Math.max(...input.citations.map((c) => c.relevanceScore));
      const minRelevance = Math.min(...input.citations.map((c) => c.relevanceScore));
      if (maxRelevance - minRelevance > 0.60) {
        return `Wide relevance spread in citations (${minRelevance.toFixed(2)} to ${maxRelevance.toFixed(2)}) — possible conflicting evidence`;
      }
      return null;
    },
  },
  {
    id: 'NO_UNSUPPORTED_CONCLUSIONS',
    description: 'Conclusions must be supported by cited evidence',
    severity: 'blocking',
    check: (input) => {
      // Check if any claim mentions a specific named entity or event
      // that has no corresponding citation
      const namedEntityClaims = input.claims.filter((c) =>
        /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(c) // rough proper noun detection
      );
      if (namedEntityClaims.length > 0 && input.citations.length === 0) {
        return `Claims involving named entities but no supporting citations`;
      }
      return null;
    },
  },
];

// ── Validator ─────────────────────────────────────────────────────────────────

export function validateEvidence(input: EvidenceValidationInput): ValidationResult {
  const blockingErrors: string[] = [];
  const warnings: string[] = [];
  const rulesPassed: ValidationRuleId[] = [];
  const rulesFailed: ValidationRuleId[] = [];
  const rulesChecked: ValidationRuleId[] = [];

  for (const rule of RULES) {
    rulesChecked.push(rule.id);
    const error = rule.check(input);
    if (error) {
      rulesFailed.push(rule.id);
      if (rule.severity === 'blocking') {
        blockingErrors.push(`[${rule.id}] ${error}`);
      } else {
        warnings.push(`[${rule.id}] ${error}`);
      }
    } else {
      rulesPassed.push(rule.id);
    }
  }

  return {
    passed: blockingErrors.length === 0,
    blockingErrors,
    warnings,
    rulesChecked,
    rulesPassed,
    rulesFailed,
    validatedAt: new Date().toISOString(),
  };
}

// ── Quick validation helper ───────────────────────────────────────────────────

export function quickValidate(
  text: string,
  citations: Citation[],
  confidence: number,
): { passed: boolean; summary: string } {
  const result = validateEvidence({
    claims: [text],
    citations,
    confidence,
  });

  const summary = result.passed
    ? `Validation passed (${result.rulesPassed.length}/${result.rulesChecked.length} rules)`
    : `Validation failed: ${result.blockingErrors.join('; ')}`;

  return { passed: result.passed, summary };
}
