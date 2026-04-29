// Hawkeye Sterling — case-narrative composer.
// Produces the charter-mandated 7-section output from structured findings.
// Never writes legal conclusions (P3) or tipping-off text (P4). The validator
// in ./validator.ts is the downstream gate.

import { OUTPUT_SECTIONS, type OutputSection, type MatchConfidenceLevel } from '../policy/systemPrompt.js';

export interface NarrativeSubject {
  nameRaw: string;
  nameNormalised?: string;
  entityType: 'individual' | 'organisation' | 'vessel' | 'aircraft' | 'other';
  nationality?: string;
  dateOfBirth?: string;
  identifiers?: Array<{ kind: string; number: string; issuer?: string }>;
}

export interface NarrativeScope {
  listsChecked: string[];
  listVersionDates: Record<string, string>;
  jurisdictions: string[];
  adverseMediaFrom?: string;
  adverseMediaTo?: string;
  matchingMethods: string[];
}

export interface NarrativeFinding {
  source: string;
  publishedAt?: string;
  confidence: MatchConfidenceLevel;
  basisIdentifiers: string[];
  disambiguatorsPresent: string[];
  disambiguatorsAbsent: string[];
  nature: 'sanctions' | 'PEP' | 'RCA' | 'adverse_media' | 'enforcement' | 'litigation' | 'other';
  claim: string;
  languageIso: string;
  reasoningModeIds: string[];
  doctrineIds?: string[];
  redFlagIds?: string[];
  typologyIds?: string[];
}

export interface NarrativeInputs {
  subject: NarrativeSubject;
  scope: NarrativeScope;
  findings: NarrativeFinding[];
  gaps: string[];
  redFlags: Array<{ id: string; indicator: string }>;
  recommendedNextSteps: string[];
  scopeHash: string;
  modelCaveat: string;
}

export interface Narrative {
  sections: Record<OutputSection, string>;
  text: string;
}

function bullet(items: string[]): string {
  return items.map((s) => `• ${s}`).join('\n');
}

export function composeCaseNarrative(input: NarrativeInputs): Narrative {
  const { subject, scope, findings, gaps, redFlags, recommendedNextSteps, scopeHash, modelCaveat } = input;

  const subjectBlock = [
    `Name (as provided): ${subject.nameRaw}`,
    subject.nameNormalised ? `Name (normalised): ${subject.nameNormalised}` : '',
    `Entity type: ${subject.entityType}`,
    subject.nationality ? `Nationality / jurisdiction: ${subject.nationality}` : '',
    subject.dateOfBirth ? `Date of birth / incorporation: ${subject.dateOfBirth}` : '',
    subject.identifiers && subject.identifiers.length
      ? `Identifiers: ${subject.identifiers.map((i) => `${i.kind}=${i.number}${i.issuer ? ` (${i.issuer})` : ''}`).join('; ')}`
      : 'Identifiers: none supplied',
  ].filter(Boolean).join('\n');

  const scopeBlock = [
    `Lists checked: ${scope.listsChecked.join(', ') || 'none'}`,
    `List versions: ${Object.entries(scope.listVersionDates).map(([k, v]) => `${k}@${v}`).join('; ') || 'not declared'}`,
    `Jurisdictions in scope: ${scope.jurisdictions.join(', ') || 'not declared'}`,
    scope.adverseMediaFrom || scope.adverseMediaTo
      ? `Adverse-media date range: ${scope.adverseMediaFrom ?? 'n/a'} → ${scope.adverseMediaTo ?? 'n/a'}`
      : 'Adverse-media date range: not declared',
    `Matching methods: ${scope.matchingMethods.join(', ') || 'not declared'}`,
  ].join('\n');

  const findingsBlock = findings.length === 0
    ? 'No hits at any confidence level within the declared scope.'
    : findings.map((f, idx) => [
        `[${idx + 1}] Source: ${f.source}${f.publishedAt ? ` · ${f.publishedAt}` : ''}`,
        `     Confidence: ${f.confidence}`,
        `     Basis: ${f.basisIdentifiers.join(', ') || 'none'}`,
        `     Disambiguators present: ${f.disambiguatorsPresent.join(', ') || 'none'}`,
        `     Disambiguators absent:  ${f.disambiguatorsAbsent.join(', ') || 'none'}`,
        `     Nature: ${f.nature}`,
        `     Language: ${f.languageIso}`,
        `     Claim: ${f.claim}`,
        `     Modes: ${f.reasoningModeIds.join(', ')}`,
        f.doctrineIds?.length ? `     Doctrines: ${f.doctrineIds.join(', ')}` : '',
        f.redFlagIds?.length ? `     Red flags: ${f.redFlagIds.join(', ')}` : '',
        f.typologyIds?.length ? `     Typologies: ${f.typologyIds.join(', ')}` : '',
      ].filter(Boolean).join('\n')).join('\n\n');

  const gapsBlock = gaps.length === 0
    ? 'No outstanding information gaps declared. (Note: absence of a declared gap is not a declaration that none exist.)'
    : bullet(gaps);

  const redFlagBlock = redFlags.length === 0
    ? 'No red-flag indicators recorded.'
    : bullet(redFlags.map((rf) => `${rf.id} — ${rf.indicator}`));

  const recommendedBlock = recommendedNextSteps.length === 0
    ? 'No follow-up actions recommended. MLRO may still apply discretion.'
    : bullet(recommendedNextSteps);

  const auditBlock = [
    `Scope hash: ${scopeHash}`,
    `Generated: ${new Date().toISOString()}`,
    `Model caveat: ${modelCaveat}`,
    'This output is decision support, not a decision. MLRO review required.',
  ].join('\n');

  const sections: Record<OutputSection, string> = {
    SUBJECT_IDENTIFIERS: subjectBlock,
    SCOPE_DECLARATION: scopeBlock,
    FINDINGS: findingsBlock,
    GAPS: gapsBlock,
    RED_FLAGS: redFlagBlock,
    RECOMMENDED_NEXT_STEPS: recommendedBlock,
    AUDIT_LINE: auditBlock,
  };

  const text = (OUTPUT_SECTIONS as readonly OutputSection[])
    .map((s) => `== ${s} ==\n${sections[s]}`)
    .join('\n\n');

  return { sections, text };
}
