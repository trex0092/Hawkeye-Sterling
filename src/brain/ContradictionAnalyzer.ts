// Hawkeye Sterling — contradiction analyzer.
// Detects contradictory evidence between a subject and a candidate entity.
// When contradictions are found, confidence is downgraded and manual review
// is flagged. Generates a contradiction graph for investigation workspace.
//
// A contradiction is definitive evidence that two records may NOT be the
// same entity. Contradictions must REDUCE confidence, never be ignored.

export interface EntityProfile {
  name: string;
  dateOfBirth?: string | undefined;
  dateOfIncorporation?: string | undefined;
  nationality?: string | undefined;
  nationalities?: string[] | undefined;
  identifiers?: Array<{ kind: string; number: string; issuer?: string | undefined }> | undefined;
  addresses?: Array<{ country?: string | undefined; city?: string | undefined; full?: string | undefined }> | undefined;
  gender?: 'M' | 'F' | 'unknown' | undefined;
  entityType?: string | undefined;
  deceasedDate?: string | undefined;
  passportExpiryDate?: string | undefined;
  incorporationCountry?: string | undefined;
}

export type ContradictionSeverity = 'critical' | 'major' | 'minor';

export interface Contradiction {
  field: string;
  subjectValue: string;
  candidateValue: string;
  reason: string;
  severity: ContradictionSeverity;
  confidenceImpact: number;  // 0..1 — how much to reduce confidence
}

export interface ContradictionEdge {
  from: string;
  to: string;
  field: string;
  conflictType: 'mismatch' | 'impossible_timeline' | 'conflicting_document' | 'mutually_exclusive';
  description: string;
}

export interface ContradictionReport {
  contradictions: Contradiction[];
  confidencePenalty: number;   // total penalty to subtract from confidence score
  requiresManualReview: boolean;
  manualReviewTriggers: string[];
  impossibleTimeline: boolean;
  graph: ContradictionEdge[];
  summary: string;
}

// ── Helper functions ──────────────────────────────────────────────────────────

function parseDate(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function yearDiff(a: Date, b: Date): number {
  return Math.abs(a.getFullYear() - b.getFullYear()) +
         Math.abs(a.getMonth() - b.getMonth()) / 12;
}

function ageAtDate(dob: Date, at: Date): number {
  return (at.getTime() - dob.getTime()) / (365.25 * 86_400_000);
}

// ── DOB contradiction ────────────────────────────────────────────────────────

function checkDOB(subject: EntityProfile, candidate: EntityProfile): Contradiction | null {
  const sDate = parseDate(subject.dateOfBirth);
  const cDate = parseDate(candidate.dateOfBirth);
  if (!sDate || !cDate) return null;

  const diff = yearDiff(sDate, cDate);
  if (diff <= 1.5) return null; // within 18 months — acceptable variation

  const severity: ContradictionSeverity = diff > 10 ? 'critical' : diff > 5 ? 'major' : 'minor';
  const impact = diff > 10 ? 0.30 : diff > 5 ? 0.20 : 0.10;

  return {
    field: 'dateOfBirth',
    subjectValue: subject.dateOfBirth ?? '',
    candidateValue: candidate.dateOfBirth ?? '',
    reason: `Date of birth differs by ${diff.toFixed(1)} years (${subject.dateOfBirth} vs ${candidate.dateOfBirth})`,
    severity,
    confidenceImpact: impact,
  };
}

// ── Nationality contradiction ─────────────────────────────────────────────────

function checkNationality(subject: EntityProfile, candidate: EntityProfile): Contradiction | null {
  const sNats = new Set([
    ...(subject.nationalities ?? []),
    ...(subject.nationality ? [subject.nationality] : []),
  ].map((n) => n.toUpperCase()));

  const cNats = new Set([
    ...(candidate.nationalities ?? []),
    ...(candidate.nationality ? [candidate.nationality] : []),
  ].map((n) => n.toUpperCase()));

  if (sNats.size === 0 || cNats.size === 0) return null;

  // Check for any overlap
  const overlap = [...sNats].some((n) => cNats.has(n));
  if (overlap) return null;

  return {
    field: 'nationality',
    subjectValue: [...sNats].join(', '),
    candidateValue: [...cNats].join(', '),
    reason: `Nationality mismatch: subject (${[...sNats].join(', ')}) vs candidate (${[...cNats].join(', ')})`,
    severity: 'major',
    confidenceImpact: 0.15,
  };
}

// ── Identifier contradiction ──────────────────────────────────────────────────

function checkIdentifiers(subject: EntityProfile, candidate: EntityProfile): Contradiction[] {
  const contradictions: Contradiction[] = [];
  if (!subject.identifiers || !candidate.identifiers) return contradictions;

  const byKindSubject = new Map(
    subject.identifiers.map((i) => [i.kind, i.number.replace(/\s+/g, '')])
  );

  for (const cId of candidate.identifiers) {
    const sNum = byKindSubject.get(cId.kind);
    const cNum = cId.number.replace(/\s+/g, '');
    if (sNum && sNum !== cNum) {
      contradictions.push({
        field: `identifier.${cId.kind}`,
        subjectValue: sNum,
        candidateValue: cNum,
        reason: `${cId.kind} mismatch: subject=${sNum} vs candidate=${cNum}`,
        severity: 'critical',
        confidenceImpact: 0.40,
      });
    }
  }
  return contradictions;
}

// ── Gender contradiction ──────────────────────────────────────────────────────

function checkGender(subject: EntityProfile, candidate: EntityProfile): Contradiction | null {
  if (!subject.gender || !candidate.gender) return null;
  if (subject.gender === 'unknown' || candidate.gender === 'unknown') return null;
  if (subject.gender !== candidate.gender) {
    return {
      field: 'gender',
      subjectValue: subject.gender,
      candidateValue: candidate.gender,
      reason: `Gender mismatch: subject=${subject.gender} vs candidate=${candidate.gender}`,
      severity: 'major',
      confidenceImpact: 0.25,
    };
  }
  return null;
}

// ── Impossible timeline check ─────────────────────────────────────────────────

function checkImpossibleTimeline(subject: EntityProfile, candidate: EntityProfile): Contradiction | null {
  const dob = parseDate(candidate.dateOfBirth ?? subject.dateOfBirth);
  const deceased = parseDate(candidate.deceasedDate ?? subject.deceasedDate);
  const passportExpiry = parseDate(candidate.passportExpiryDate);

  // Check: passport issued after deceased date
  if (deceased && passportExpiry && passportExpiry > deceased) {
    return {
      field: 'timeline',
      subjectValue: `deceased: ${candidate.deceasedDate}`,
      candidateValue: `passport expiry: ${candidate.passportExpiryDate}`,
      reason: 'Impossible timeline: passport expires after deceased date',
      severity: 'critical',
      confidenceImpact: 0.50,
    };
  }

  // Check: DOB implies impossible age (born after action date)
  if (dob) {
    const now = new Date();
    const age = ageAtDate(dob, now);
    if (age < 0) {
      return {
        field: 'timeline',
        subjectValue: `dob: ${candidate.dateOfBirth}`,
        candidateValue: `today: ${now.toISOString().slice(0, 10)}`,
        reason: `Impossible timeline: date of birth (${candidate.dateOfBirth}) is in the future`,
        severity: 'critical',
        confidenceImpact: 0.60,
      };
    }
    if (age > 120) {
      return {
        field: 'timeline',
        subjectValue: `dob: ${candidate.dateOfBirth}`,
        candidateValue: `implied age: ${age.toFixed(0)} years`,
        reason: `Implausible age: ${age.toFixed(0)} years old`,
        severity: 'major',
        confidenceImpact: 0.20,
      };
    }
  }

  return null;
}

// ── Address country plausibility ──────────────────────────────────────────────

function checkAddresses(subject: EntityProfile, candidate: EntityProfile): Contradiction | null {
  const sCountries = new Set(
    (subject.addresses ?? []).map((a) => a.country?.toUpperCase()).filter(Boolean) as string[]
  );
  const cCountries = new Set(
    (candidate.addresses ?? []).map((a) => a.country?.toUpperCase()).filter(Boolean) as string[]
  );

  if (sCountries.size === 0 || cCountries.size === 0) return null;

  const overlap = [...sCountries].some((c) => cCountries.has(c));
  if (!overlap && sCountries.size > 0 && cCountries.size > 0) {
    // Not a hard contradiction — addresses change — but worth noting
    return {
      field: 'address.country',
      subjectValue: [...sCountries].join(', '),
      candidateValue: [...cCountries].join(', '),
      reason: `No country overlap: subject in (${[...sCountries].join(', ')}) vs candidate in (${[...cCountries].join(', ')})`,
      severity: 'minor',
      confidenceImpact: 0.05,
    };
  }
  return null;
}

// ── Contradiction graph builder ───────────────────────────────────────────────

function buildContradictionGraph(contradictions: Contradiction[]): ContradictionEdge[] {
  return contradictions.map((c): ContradictionEdge => ({
    from: `subject.${c.field}`,
    to: `candidate.${c.field}`,
    field: c.field,
    conflictType: c.field === 'timeline' ? 'impossible_timeline'
      : c.field.startsWith('identifier') ? 'conflicting_document'
      : c.severity === 'critical' ? 'mutually_exclusive'
      : 'mismatch',
    description: c.reason,
  }));
}

// ── Main analyzer ─────────────────────────────────────────────────────────────

export function analyzeContradictions(
  subject: EntityProfile,
  candidate: EntityProfile,
): ContradictionReport {
  const contradictions: Contradiction[] = [];

  // Run all checks
  const dobContradiction = checkDOB(subject, candidate);
  if (dobContradiction) contradictions.push(dobContradiction);

  const natContradiction = checkNationality(subject, candidate);
  if (natContradiction) contradictions.push(natContradiction);

  const idContradictions = checkIdentifiers(subject, candidate);
  contradictions.push(...idContradictions);

  const genderContradiction = checkGender(subject, candidate);
  if (genderContradiction) contradictions.push(genderContradiction);

  const timelineContradiction = checkImpossibleTimeline(subject, candidate);
  if (timelineContradiction) contradictions.push(timelineContradiction);

  const addressContradiction = checkAddresses(subject, candidate);
  if (addressContradiction) contradictions.push(addressContradiction);

  // Calculate total confidence penalty (cap at 0.80 to preserve some signal)
  const totalPenalty = Math.min(
    0.80,
    contradictions.reduce((sum, c) => sum + c.confidenceImpact, 0),
  );

  // Manual review triggers
  const manualReviewTriggers: string[] = [];
  const critical = contradictions.filter((c) => c.severity === 'critical');
  const major = contradictions.filter((c) => c.severity === 'major');

  if (critical.length > 0) {
    manualReviewTriggers.push(`${critical.length} critical contradiction(s): ${critical.map((c) => c.field).join(', ')}`);
  }
  if (major.length >= 2) {
    manualReviewTriggers.push(`Multiple major contradictions: ${major.map((c) => c.field).join(', ')}`);
  }

  const impossibleTimeline = contradictions.some((c) => c.field === 'timeline' && c.severity === 'critical');
  if (impossibleTimeline) {
    manualReviewTriggers.push('Impossible timeline detected — possible identity fraud');
  }

  const requiresManualReview = manualReviewTriggers.length > 0;

  const graph = buildContradictionGraph(contradictions);

  const summary = contradictions.length === 0
    ? 'No contradictions detected.'
    : `${contradictions.length} contradiction(s) detected (penalty: -${(totalPenalty * 100).toFixed(0)}%). ${manualReviewTriggers.join('; ')}`;

  return {
    contradictions,
    confidencePenalty: totalPenalty,
    requiresManualReview,
    manualReviewTriggers,
    impossibleTimeline,
    graph,
    summary,
  };
}
