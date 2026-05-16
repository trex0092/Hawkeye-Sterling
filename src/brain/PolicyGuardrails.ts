// Hawkeye Sterling — policy-aware prompting guardrails.
// Enforces that AI outputs comply with regulatory constraints:
//   - No legal conclusions (that is a function of qualified lawyers)
//   - No guilt assertions (innocent until proven guilty)
//   - No unsupported sanctions claims
//   - No hallucinated adverse media
//   - No tipping-off violations (FATF R.21)
//   - No disclosure of STR/SAR filing status to the subject
//
// Applied to BOTH prompt construction (input guardrails) and
// response validation (output guardrails).

// ── Guardrail types ───────────────────────────────────────────────────────────

export type GuardrailType =
  | 'input'   // applied to prompt/query before sending to AI
  | 'output'; // applied to AI response before delivery

export type GuardrailSeverity =
  | 'block'    // reject entirely
  | 'redact'   // replace with placeholder
  | 'warn'     // allow but flag
  | 'flag';    // log only

export interface GuardrailRule {
  id: string;
  name: string;
  type: GuardrailType | 'both';
  severity: GuardrailSeverity;
  description: string;
  check: (text: string, context?: GuardrailContext) => GuardrailViolation | null;
  remediation: string;
}

export interface GuardrailContext {
  subjectIsCustomer?: boolean;  // true = tipping-off rules apply
  isPublicOutput?: boolean;     // true = stricter guardrails
  userRole?: string;            // analyst, mlro, legal, public
  jurisdictions?: string[];
}

export interface GuardrailViolation {
  ruleId: string;
  ruleName: string;
  severity: GuardrailSeverity;
  detectedText: string;
  remediation: string;
  position?: number;
}

export interface GuardrailResult {
  passed: boolean;
  blockedBy: GuardrailViolation[];
  warnings: GuardrailViolation[];
  redactions: GuardrailViolation[];
  processedText: string;      // text after redactions applied
  appliedAt: string;
}

// ── Rule library ──────────────────────────────────────────────────────────────

const GUARDRAIL_RULES: GuardrailRule[] = [
  // ── No guilt assertions ────────────────────────────────────────────────────
  {
    id: 'NO_GUILT_ASSERTION',
    name: 'No Guilt Assertions',
    type: 'output',
    severity: 'block',
    description: 'AI must not assert that a person is guilty of any crime',
    remediation: 'Replace with "alleged", "reported to have", "according to [source]", or "subject to investigation"',
    check: (text) => {
      const patterns = [
        /\b(?:is|are|was|were)\s+(?:guilty|a\s+criminal|convicted|a\s+money\s+launderer|a\s+terrorist)\b/gi,
        /\bproven\s+(?:to\s+be\s+)?(?:guilty|corrupt|fraudulent)\b/gi,
        /\bcommitted\s+(?:fraud|money\s+laundering|terrorism|bribery|corruption)\b/gi,
        /\bknown\s+(?:criminal|fraudster|terrorist|launderer)\b/gi,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m) return { ruleId: 'NO_GUILT_ASSERTION', ruleName: 'No Guilt Assertions', severity: 'block', detectedText: m[0] ?? '', remediation: 'Use passive/alleged form', position: text.indexOf(m[0] ?? '') };
      }
      return null;
    },
  },

  // ── No legal conclusions ───────────────────────────────────────────────────
  {
    id: 'NO_LEGAL_CONCLUSION',
    name: 'No Legal Conclusions',
    type: 'output',
    severity: 'block',
    description: 'AI must not draw legal conclusions — that is the role of qualified legal counsel',
    remediation: 'Replace legal conclusions with factual descriptions and refer to legal counsel',
    check: (text, context) => {
      if (context?.userRole === 'legal_counsel') return null; // legal counsel may see conclusions
      const patterns = [
        /\bconstitutes?\s+(?:money\s+laundering|a\s+criminal\s+offence|terrorism|fraud)\b/gi,
        /\b(?:violates?|in\s+violation\s+of)\s+(?:the\s+)?(?:law|FCPA|Bribery\s+Act|AML\s+regulations)\b/gi,
        /\b(?:must|should|is\s+required\s+to)\s+(?:be\s+arrested|be\s+prosecuted|face\s+criminal\s+charges)\b/gi,
        /\blegally\s+(?:required|obligated|liable)\s+to\b/gi,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m) return { ruleId: 'NO_LEGAL_CONCLUSION', ruleName: 'No Legal Conclusions', severity: 'block', detectedText: m[0] ?? '', remediation: 'Describe facts; refer legal conclusions to counsel', position: text.indexOf(m[0] ?? '') };
      }
      return null;
    },
  },

  // ── No unsupported sanctions claims ────────────────────────────────────────
  {
    id: 'NO_UNSUPPORTED_SANCTIONS',
    name: 'No Unsupported Sanctions Claims',
    type: 'output',
    severity: 'block',
    description: 'Sanctions designations must only be stated when backed by official list citation',
    remediation: 'Only state "sanctioned" when citation from official list (OFAC, UN, EU, UK) is provided',
    check: (text) => {
      const sanctionsClaim = /\b(?:is|are|was|were)\s+(?:sanctioned|on\s+the\s+(?:SDN|OFAC|UN|EU)\s+(?:list|sanctions))\b/gi;
      const m = text.match(sanctionsClaim);
      if (m) {
        // This is a WARNING at output level — caller must verify citation backing
        return { ruleId: 'NO_UNSUPPORTED_SANCTIONS', ruleName: 'No Unsupported Sanctions Claims', severity: 'warn', detectedText: m[0] ?? '', remediation: 'Verify claim is backed by official list citation', position: text.indexOf(m[0] ?? '') };
      }
      return null;
    },
  },

  // ── No tipping-off ────────────────────────────────────────────────────────
  {
    id: 'NO_TIPPING_OFF',
    name: 'Tipping-Off Prevention (FATF R.21)',
    type: 'output',
    severity: 'block',
    description: 'Must not disclose to the subject that an STR/SAR has been filed or is under consideration',
    remediation: 'Remove any reference to STR/SAR filing status in customer-facing communications',
    check: (text, context) => {
      if (!context?.subjectIsCustomer) return null;
      const patterns = [
        /\b(?:SAR|STR|suspicious\s+(?:activity|transaction)\s+report)\s+(?:has\s+been\s+)?(?:filed|submitted|raised|considered)\b/gi,
        /\bwe\s+have\s+(?:reported|flagged)\s+(?:you|your\s+account|your\s+transactions)\s+to\b/gi,
        /\bunder\s+investigation\s+for\s+(?:money\s+laundering|terrorism|fraud)\b/gi,
        /\byour\s+account\s+(?:has\s+been\s+)?(?:flagged|blocked|frozen)\s+(?:for|due\s+to)\s+(?:AML|compliance|suspicious)/gi,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m) return { ruleId: 'NO_TIPPING_OFF', ruleName: 'Tipping-Off Prevention', severity: 'block', detectedText: m[0] ?? '', remediation: 'Remove STR/SAR reference from customer-facing output' };
      }
      return null;
    },
  },

  // ── No personal data in public output ────────────────────────────────────
  {
    id: 'NO_PII_IN_PUBLIC_OUTPUT',
    name: 'No PII in Public Output',
    type: 'output',
    severity: 'redact',
    description: 'Passport numbers, national IDs, and DOBs must not appear in public-facing outputs',
    remediation: 'Redact or mask identifier values in public outputs',
    check: (text, context) => {
      if (!context?.isPublicOutput) return null;
      const patterns = [
        /\bpassport(?:\s+(?:no|number|#))?[:.\s]+[A-Z]{1,2}\d{6,9}\b/gi,
        /\bDOB:\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi,
        /\bnational\s+ID[:.\s]+\d{8,12}\b/gi,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m) return { ruleId: 'NO_PII_IN_PUBLIC_OUTPUT', ruleName: 'No PII in Public Output', severity: 'redact', detectedText: m[0] ?? '', remediation: 'Mask identifier: [REDACTED]' };
      }
      return null;
    },
  },

  // ── No hallucinated financial figures ──────────────────────────────────────
  {
    id: 'NO_HALLUCINATED_FIGURES',
    name: 'No Unverified Financial Figures',
    type: 'output',
    severity: 'warn',
    description: 'Specific financial amounts must be traced to a cited source',
    remediation: 'Qualify financial figures with the source citation',
    check: (text) => {
      // Flag very specific amounts without apparent citation
      const amountWithoutCitation = /\$[\d,]+(?:\.\d+)?\s*(?:million|billion)?\s+(?:was\s+)?(?:laundered|transferred|embezzled|stolen)\b/gi;
      const m = text.match(amountWithoutCitation);
      if (m) return { ruleId: 'NO_HALLUCINATED_FIGURES', ruleName: 'No Unverified Financial Figures', severity: 'warn', detectedText: m[0] ?? '', remediation: 'Cite source for financial figure' };
      return null;
    },
  },

  // ── Prompt injection guard ──────────────────────────────────────────────────
  {
    id: 'PROMPT_INJECTION_GUARD',
    name: 'Prompt Injection Prevention',
    type: 'input',
    severity: 'block',
    description: 'Detect and block prompt injection attempts in user input',
    remediation: 'Sanitize input; do not process as instructions',
    check: (text) => {
      const injectionPatterns = [
        /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/gi,
        /you\s+are\s+now\s+(?:a\s+)?(?:different|unrestricted|jailbroken)/gi,
        /system\s+prompt:\s*/gi,
        /\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>/gi,
        /disregard\s+(?:your|all)\s+(?:guidelines|rules|constraints|policies)/gi,
        /pretend\s+(?:you\s+are|to\s+be)\s+(?:an?\s+)?(?:AI\s+without|unrestricted)/gi,
      ];
      for (const p of injectionPatterns) {
        const m = text.match(p);
        if (m) return { ruleId: 'PROMPT_INJECTION_GUARD', ruleName: 'Prompt Injection Prevention', severity: 'block', detectedText: m[0] ?? '', remediation: 'Reject input as potential prompt injection' };
      }
      return null;
    },
  },
];

// ── Redaction helpers ─────────────────────────────────────────────────────────

function applyRedaction(text: string, violation: GuardrailViolation): string {
  return text.replace(violation.detectedText, '[REDACTED]');
}

// ── Guardrail engine ──────────────────────────────────────────────────────────

export function applyGuardrails(
  text: string,
  type: GuardrailType,
  context?: GuardrailContext,
): GuardrailResult {
  const applicableRules = GUARDRAIL_RULES.filter(
    (r) => r.type === type || r.type === 'both'
  );

  const blockedBy: GuardrailViolation[] = [];
  const warnings: GuardrailViolation[] = [];
  const redactions: GuardrailViolation[] = [];
  let processedText = text;

  for (const rule of applicableRules) {
    const violation = rule.check(text, context);
    if (!violation) continue;

    switch (violation.severity) {
      case 'block':
        blockedBy.push(violation);
        break;
      case 'warn':
      case 'flag':
        warnings.push(violation);
        break;
      case 'redact':
        redactions.push(violation);
        processedText = applyRedaction(processedText, violation);
        break;
    }
  }

  return {
    passed: blockedBy.length === 0,
    blockedBy,
    warnings,
    redactions,
    processedText,
    appliedAt: new Date().toISOString(),
  };
}

// ── Prompt sanitizer ──────────────────────────────────────────────────────────

export function sanitizePromptInput(userInput: string): {
  safe: boolean;
  sanitized: string;
  violations: string[];
} {
  const result = applyGuardrails(userInput, 'input');
  return {
    safe: result.passed,
    sanitized: result.processedText,
    violations: result.blockedBy.map((v) => `[${v.ruleId}] ${v.detectedText}`),
  };
}

// ── System prompt builder ─────────────────────────────────────────────────────

export function buildComplianceSystemPrompt(options?: {
  jurisdiction?: string;
  entityType?: string;
  userRole?: string;
}): string {
  const jurisdiction = options?.jurisdiction ?? 'UAE';
  const role = options?.userRole ?? 'compliance analyst';

  return [
    `You are Hawkeye Sterling, an AI compliance assistant for AML/CFT screening.`,
    `You are assisting a ${role} in ${jurisdiction}.`,
    ``,
    `## Mandatory constraints (non-negotiable):`,
    `1. Never assert that any person or entity is guilty of any crime.`,
    `2. Never draw legal conclusions — state "this may warrant legal review" not "this violates the law".`,
    `3. Never claim an entity is sanctioned without citing the specific official list and entry.`,
    `4. Never disclose STR/SAR filing status to a subject (FATF R.21 tipping-off prohibition).`,
    `5. Every factual claim must cite a source. If no source exists, say "insufficient evidence".`,
    `6. Use "alleged", "reported to", "according to [source]" for unverified claims.`,
    `7. Confidence must be stated when below 80%: "low confidence — corroboration required".`,
    `8. If asked to act outside compliance scope, refuse and explain why.`,
    ``,
    `## Output format:`,
    `- Lead with evidence, then analysis, then recommendation.`,
    `- Cite sources by ID (e.g., [OFAC SDN] or [Reuters, 2024-03-15]).`,
    `- Clearly separate facts from analysis from recommendations.`,
    `- Flag data gaps that materially affect the assessment.`,
  ].join('\n');
}
