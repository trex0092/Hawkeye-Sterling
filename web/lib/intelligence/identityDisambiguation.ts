// Hawkeye Sterling — per-hit identity disambiguation scoring.
//
// World-Check One displays a green "Match Strength" bar that combines
// name-match + DOB-match + citizenship-match + place-of-birth-match
// into a single confidence score. We replicate that here.
//
// Inputs are the subject's known discriminators and the candidate
// record's discriminators. Output is 0..100 confidence + a per-field
// breakdown so the UI can show ✓/✗ markers.

export interface SubjectDiscriminators {
  name: string;
  dateOfBirth?: string;        // ISO date OR year-only "1985"
  yearOfBirth?: number;
  nationality?: string;        // ISO-2
  placeOfBirth?: string;
  passportNumber?: string;
  nationalIdNumber?: string;
}

export interface CandidateDiscriminators {
  name: string;
  dateOfBirth?: string;
  yearOfBirth?: number;
  nationality?: string;
  citizenship?: string;
  placeOfBirth?: string;
  identifiers?: Array<{ type?: string; value?: string }>;
}

export type FieldMatch = "match" | "near" | "mismatch" | "unknown";

export interface DisambiguationResult {
  confidence: number;                  // 0..100
  band: "high" | "moderate" | "low" | "none";
  fieldMatches: {
    name: FieldMatch;
    dateOfBirth: FieldMatch;
    nationality: FieldMatch;
    placeOfBirth: FieldMatch;
    idNumber: FieldMatch;
  };
  agreeingFields: number;
  disagreeingFields: number;
  unknownFields: number;
  signal: string;
}

function parseYear(s?: string): number | undefined {
  if (!s) return undefined;
  const m = /^\s*(\d{4})/.exec(s);
  return m ? parseInt(m[1]!, 10) : undefined;
}

function normalize(s?: string): string {
  return (s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]/gu, " ").replace(/\s+/g, " ").trim();
}

function matchYear(subject: SubjectDiscriminators, candidate: CandidateDiscriminators): FieldMatch {
  const sy = subject.yearOfBirth ?? parseYear(subject.dateOfBirth);
  const cy = candidate.yearOfBirth ?? parseYear(candidate.dateOfBirth);
  if (sy === undefined || cy === undefined) return "unknown";
  if (sy === cy) return "match";
  if (Math.abs(sy - cy) <= 1) return "near";    // ±1 year tolerance for inferred / approximate DOBs
  return "mismatch";
}

function matchCountry(s?: string, c?: string): FieldMatch {
  if (!s || !c) return "unknown";
  const sn = normalize(s);
  const cn = normalize(c);
  if (sn === cn) return "match";
  // ISO-2 vs full name e.g. "PK" vs "Pakistan"
  if (sn.length <= 3 && cn.includes(sn)) return "match";
  if (cn.length <= 3 && sn.includes(cn)) return "match";
  return "mismatch";
}

function matchName(subjectName: string, candidateName: string): FieldMatch {
  const s = normalize(subjectName);
  const c = normalize(candidateName);
  if (!s || !c) return "unknown";
  if (s === c) return "match";
  // Token-set intersection — at least 2 matching tokens or all subject tokens contained in candidate
  const sTokens = new Set(s.split(" "));
  const cTokens = new Set(c.split(" "));
  const intersection = [...sTokens].filter((t) => cTokens.has(t));
  if (intersection.length >= 2) return "near";
  if (intersection.length === sTokens.size && sTokens.size >= 1) return "near";
  return "mismatch";
}

function matchIdNumber(subject: SubjectDiscriminators, candidate: CandidateDiscriminators): FieldMatch {
  const subjectIds = [subject.passportNumber, subject.nationalIdNumber].filter(Boolean) as string[];
  if (subjectIds.length === 0) return "unknown";
  const candidateIds = (candidate.identifiers ?? []).map((i) => i.value).filter(Boolean) as string[];
  if (candidateIds.length === 0) return "unknown";
  // Strip whitespace + uppercase for comparison
  const sSet = new Set(subjectIds.map((s) => s.replace(/\s+/g, "").toUpperCase()));
  for (const c of candidateIds) {
    if (sSet.has(c.replace(/\s+/g, "").toUpperCase())) return "match";
  }
  return "mismatch";
}

/**
 * Computes identity-confidence for a single hit.
 *
 * Field weights:
 *   name             0.30
 *   date of birth    0.30
 *   nationality      0.20
 *   place of birth   0.10
 *   id number        0.10
 *
 * Match scores: match=1.0, near=0.7, mismatch=0.0, unknown=0.5 (neutral)
 *
 * Bands: high >= 75, moderate >= 50, low >= 25, else none.
 */
export function disambiguateIdentity(
  subject: SubjectDiscriminators,
  candidate: CandidateDiscriminators,
): DisambiguationResult {
  const fieldMatches = {
    name: matchName(subject.name, candidate.name),
    dateOfBirth: matchYear(subject, candidate),
    nationality: matchCountry(subject.nationality, candidate.nationality ?? candidate.citizenship),
    placeOfBirth: matchCountry(subject.placeOfBirth, candidate.placeOfBirth),
    idNumber: matchIdNumber(subject, candidate),
  };

  const SCORE: Record<FieldMatch, number> = {
    match: 1.0,
    near: 0.7,
    mismatch: 0,
    unknown: 0.5,
  };

  const weighted =
    SCORE[fieldMatches.name] * 0.30 +
    SCORE[fieldMatches.dateOfBirth] * 0.30 +
    SCORE[fieldMatches.nationality] * 0.20 +
    SCORE[fieldMatches.placeOfBirth] * 0.10 +
    SCORE[fieldMatches.idNumber] * 0.10;

  // Hard mismatch on DOB or ID is decisive — clamp confidence
  let confidence = Math.round(weighted * 100);
  if (fieldMatches.dateOfBirth === "mismatch") confidence = Math.min(confidence, 35);
  if (fieldMatches.idNumber === "mismatch") confidence = Math.min(confidence, 30);

  let band: DisambiguationResult["band"];
  if (confidence >= 75) band = "high";
  else if (confidence >= 50) band = "moderate";
  else if (confidence >= 25) band = "low";
  else band = "none";

  const agreeingFields = Object.values(fieldMatches).filter((m) => m === "match").length;
  const disagreeingFields = Object.values(fieldMatches).filter((m) => m === "mismatch").length;
  const unknownFields = Object.values(fieldMatches).filter((m) => m === "unknown").length;

  let signal: string;
  if (confidence >= 75) {
    signal = `${agreeingFields} fields confirm same person; treat as POSITIVE pending MLRO review.`;
  } else if (confidence >= 50) {
    signal = `${agreeingFields} fields agree, ${disagreeingFields} disagree, ${unknownFields} unknown. Insufficient corroboration — request additional discriminators before disposition.`;
  } else if (confidence >= 25) {
    signal = `Likely DIFFERENT person — ${disagreeingFields} disagreeing field(s). Document the disambiguation rationale.`;
  } else {
    signal = `Insufficient identifiers to disambiguate; treat as inconclusive and request DOB / nationality / ID number from subject.`;
  }

  return {
    confidence, band, fieldMatches,
    agreeingFields, disagreeingFields, unknownFields,
    signal,
  };
}
