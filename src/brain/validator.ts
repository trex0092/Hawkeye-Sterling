// Hawkeye Sterling — reasoning-chain validator.
// Given a brain output, verify it complies with the compliance charter:
//   - mandatory output sections present
//   - every reasoning-mode id is registered
//   - every faculty id is registered
//   - every finding cites at least one reasoning-mode id
//   - match-confidence classification present where a hit is asserted
//   - no legal-conclusion phrases in narrative text (coarse lexical check)
//
// Returns a structured diagnosis; callers decide whether to hard-fail or
// surface to MLRO for manual review.

import { FACULTY_BY_ID } from './faculties.js';
import { REASONING_MODE_BY_ID } from './reasoning-modes.js';
import { OUTPUT_SECTIONS, MATCH_CONFIDENCE_LEVELS, type OutputSection, type MatchConfidenceLevel } from '../policy/systemPrompt.js';

export interface ValidatedFinding {
  modeIds: string[];
  facultyIds?: string[];
  confidence?: MatchConfidenceLevel;
  rationale: string;
  evidenceIds?: string[];
}

export interface ValidatedResponse {
  sections: Partial<Record<OutputSection, string>>;
  findings: ValidatedFinding[];
  narrativeText?: string;
}

export interface ValidationDiagnosis {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    sectionsPresent: number;
    findings: number;
    unknownModes: number;
    unknownFaculties: number;
    missingConfidence: number;
  };
}

const LEGAL_CONCLUSION_PHRASES: RegExp[] = [
  /\b(constitutes|amounts to|qualifies as)\b.*\b(money laundering|terrorist financing|bribery|fraud|corruption|proliferation financing|sanctions evasion)\b/i,
  /\bis (guilty|liable) of\b/i,
  /\bcommitted (money laundering|terrorist financing|bribery|fraud)\b/i,
];

const TIPPING_OFF_PHRASES: RegExp[] = [
  /\bwe have (filed|submitted) an? (STR|SAR|FFR|PNMR)\b/i,
  /\byour (account|transaction) has been flagged for (suspicion|investigation)\b/i,
  /\bplease (withdraw|move) (funds|money) (before|prior to)\b/i,
];

export function validateResponse(resp: ValidatedResponse): ValidationDiagnosis {
  const errors: string[] = [];
  const warnings: string[] = [];

  const sectionsPresent = (Object.keys(resp.sections) as OutputSection[])
    .filter((k) => (OUTPUT_SECTIONS as readonly string[]).includes(k));
  for (const required of OUTPUT_SECTIONS) {
    if (!sectionsPresent.includes(required)) {
      errors.push(`missing mandatory output section: ${required}`);
    }
  }

  let unknownModes = 0;
  let unknownFaculties = 0;
  let missingConfidence = 0;

  for (const f of resp.findings) {
    if (!f.modeIds || f.modeIds.length === 0) {
      errors.push('finding has no reasoning-mode citation');
    } else {
      for (const id of f.modeIds) {
        if (!REASONING_MODE_BY_ID.has(id)) {
          errors.push(`unknown reasoning-mode id: ${id}`);
          unknownModes++;
        }
      }
    }
    if (f.facultyIds) {
      for (const id of f.facultyIds) {
        if (!FACULTY_BY_ID.has(id)) {
          errors.push(`unknown faculty id: ${id}`);
          unknownFaculties++;
        }
      }
    }
    if (!f.confidence) {
      warnings.push('finding lacks match-confidence classification');
      missingConfidence++;
    } else if (!(MATCH_CONFIDENCE_LEVELS as readonly string[]).includes(f.confidence)) {
      errors.push(`invalid match-confidence level: ${f.confidence}`);
    }
    if (!f.rationale || f.rationale.trim().length < 10) {
      warnings.push('finding rationale is thin (< 10 chars)');
    }
  }

  const text = [resp.narrativeText ?? '', ...Object.values(resp.sections)].join('\n\n');
  for (const rx of LEGAL_CONCLUSION_PHRASES) {
    if (rx.test(text)) errors.push('legal-conclusion phrasing detected (charter P3)');
  }
  for (const rx of TIPPING_OFF_PHRASES) {
    if (rx.test(text)) errors.push('potential tipping-off phrasing detected (charter P4)');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      sectionsPresent: sectionsPresent.length,
      findings: resp.findings.length,
      unknownModes,
      unknownFaculties,
      missingConfidence,
    },
  };
}
