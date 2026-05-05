// Hawkeye Sterling — name disambiguation confidence engine.
//
// Common names like "Mohamed Ali", "Wang Wei", or "Maria Garcia" produce
// thousands of same-name records. A match is only as reliable as the
// strongest identifier the analyst supplied alongside the name. This
// module quantifies match confidence and FORCES the analyst to collect
// the missing identifiers before a "this is the same person" verdict
// can stand.
//
// Decisive identifiers (alone enough to confirm):
//   - Full date of birth (DD-MM-YYYY)
//   - Passport / national ID number
//   - Biometric (face match against issued document)
//
// Strong identifiers (enough in combination):
//   - Place of birth + DOB year
//   - Father's / mother's name + DOB year (MENA-convention)
//   - Address history + employment history
//
// Weak identifiers (cannot disambiguate alone):
//   - First name + last name
//   - Citizenship
//   - Gender
//   - Year-only DOB

export type IdentifierStrength = "decisive" | "strong" | "medium" | "weak" | "absent";

export interface SubjectIdentifiers {
  fullName: string;
  aliases?: string[];
  dob?: string | null;          // ISO 8601 or "DD-MM-YYYY"
  dobYear?: number | null;
  placeOfBirth?: string | null;
  citizenship?: string | null;
  gender?: "male" | "female" | "other" | null;
  passportNumber?: string | null;
  nationalIdNumber?: string | null;
  fatherName?: string | null;
  motherName?: string | null;
  addressHistory?: string[];
  employmentHistory?: string[];
  hasBiometricMatch?: boolean;  // face match against issued ID
}

export interface CandidateIdentifiers {
  fullName: string;
  aliases?: string[];
  dob?: string | null;
  dobYear?: number | null;
  placeOfBirth?: string | null;
  citizenship?: string | null;
  gender?: "male" | "female" | "other" | null;
  passportNumber?: string | null;
  nationalIdNumber?: string | null;
  fatherName?: string | null;
  motherName?: string | null;
}

export interface DisambiguationResult {
  /** 0..1 — calibrated probability this candidate IS the subject. */
  confidence: number;
  /** Recommendation for the analyst. */
  verdict:
    | "confirmed_match"            // confidence ≥ 0.9
    | "probable_match"             // 0.7 .. 0.9
    | "possible_match"             // 0.4 .. 0.7
    | "unlikely_match"             // 0.15 .. 0.4
    | "false_positive_likely"      // < 0.15
    | "ambiguous_collect_more";    // common name, weak identifiers — block disposition
  /** Specific missing identifiers the analyst must collect. */
  missingIdentifiers: string[];
  /** Per-identifier comparison breakdown. */
  comparisons: Array<{
    field: string;
    subjectHas: boolean;
    candidateHas: boolean;
    matched: boolean | "partial";
    strength: IdentifierStrength;
    note?: string;
  }>;
  /** Whether this name is statistically common (MOHAMED, MOHAMMED, MARIA, WANG, ALI etc.). */
  isCommonName: boolean;
  /** Diagnostic narrative for the dossier. */
  narrative: string;
}

// Top common given names + surnames across MENA, South Asia, East Asia,
// Latin America. Names on this list need stronger identifiers to confirm
// a match — the engine forces the analyst to collect them.
const COMMON_NAMES = new Set<string>([
  // Arabic / MENA
  "mohamed", "mohammed", "muhammad", "mohammad", "ahmed", "ahmad", "ali", "hassan", "hussein", "hussain", "omar", "umar", "khalid", "khaled", "ibrahim", "yousef", "yusuf", "abdullah", "abdulrahman", "salem", "saleh", "fatima", "fatma", "aisha", "ayesha", "maryam", "mariam", "khadija", "zainab", "zaynab",
  // South Asia
  "raj", "kumar", "sharma", "singh", "khan", "patel", "shah", "iqbal", "rahman", "rashid", "hussain",
  // East Asia
  "wang", "li", "zhang", "liu", "chen", "yang", "zhao", "huang", "zhou", "wu", "kim", "park", "lee", "choi", "tanaka", "sato", "suzuki",
  // Latin America / Iberian
  "maria", "jose", "juan", "carlos", "luis", "miguel", "rodriguez", "garcia", "gonzalez", "lopez", "martinez", "perez", "sanchez", "fernandez",
  // Other
  "smith", "jones", "williams", "brown", "davis", "miller", "wilson", "moore", "taylor", "anderson",
]);

function normName(s: string): string {
  return s.toLowerCase().trim().replace(/[^\p{L}\s]/gu, "").replace(/\s+/g, " ");
}

function isCommonNameStr(fullName: string): boolean {
  const tokens = normName(fullName).split(" ").filter(Boolean);
  return tokens.some((t) => COMMON_NAMES.has(t));
}

function nameSimilarity(a: string, b: string): number {
  const aN = normName(a);
  const bN = normName(b);
  if (aN === bN) return 1;
  // Token overlap (Jaccard)
  const aT = new Set(aN.split(" ").filter(Boolean));
  const bT = new Set(bN.split(" ").filter(Boolean));
  const inter = [...aT].filter((t) => bT.has(t)).length;
  const uni = new Set([...aT, ...bT]).size;
  if (uni === 0) return 0;
  return inter / uni;
}

function dobMatch(
  s: SubjectIdentifiers,
  c: CandidateIdentifiers,
): { matched: boolean | "partial"; note: string; strength: IdentifierStrength } {
  if (s.dob && c.dob) {
    const a = String(s.dob).replace(/[^0-9]/g, "");
    const b = String(c.dob).replace(/[^0-9]/g, "");
    if (a.length >= 6 && b.length >= 6 && a === b) {
      return { matched: true, note: "Full DOB match", strength: "decisive" };
    }
  }
  if (s.dobYear && c.dobYear && Math.abs(s.dobYear - c.dobYear) <= 1) {
    return { matched: "partial", note: "DOB year match (±1)", strength: "medium" };
  }
  if (!s.dob && !s.dobYear) {
    return { matched: false, note: "Subject DOB unknown — cannot compare", strength: "absent" };
  }
  return { matched: false, note: "DOB mismatch", strength: "decisive" };
}

function idMatch(
  s: SubjectIdentifiers,
  c: CandidateIdentifiers,
): { matched: boolean; strength: IdentifierStrength; note: string } {
  if (s.passportNumber && c.passportNumber) {
    if (normName(s.passportNumber) === normName(c.passportNumber)) {
      return { matched: true, strength: "decisive", note: "Passport number match" };
    }
    return { matched: false, strength: "decisive", note: "Passport number mismatch" };
  }
  if (s.nationalIdNumber && c.nationalIdNumber) {
    if (normName(s.nationalIdNumber) === normName(c.nationalIdNumber)) {
      return { matched: true, strength: "decisive", note: "National ID match" };
    }
    return { matched: false, strength: "decisive", note: "National ID mismatch" };
  }
  return { matched: false, strength: "absent", note: "No ID number on file to compare" };
}

export function disambiguate(
  subject: SubjectIdentifiers,
  candidate: CandidateIdentifiers,
): DisambiguationResult {
  const comparisons: DisambiguationResult["comparisons"] = [];
  const missing: string[] = [];

  // Name
  const nameSim = nameSimilarity(subject.fullName, candidate.fullName);
  comparisons.push({
    field: "name",
    subjectHas: true,
    candidateHas: true,
    matched: nameSim >= 0.9 ? true : nameSim >= 0.5 ? "partial" : false,
    strength: "weak",
    note: `Name similarity ${(nameSim * 100).toFixed(0)}%`,
  });

  // Aliases
  const subjectAliases = (subject.aliases ?? []).map(normName);
  const candidateAliases = (candidate.aliases ?? []).map(normName);
  const aliasOverlap = subjectAliases.some((a) =>
    candidateAliases.some((b) => a === b || nameSimilarity(a, b) >= 0.85),
  );
  if (subjectAliases.length > 0 || candidateAliases.length > 0) {
    comparisons.push({
      field: "aliases",
      subjectHas: subjectAliases.length > 0,
      candidateHas: candidateAliases.length > 0,
      matched: aliasOverlap,
      strength: "medium",
    });
  }

  // DOB
  const dob = dobMatch(subject, candidate);
  comparisons.push({
    field: "dob",
    subjectHas: Boolean(subject.dob || subject.dobYear),
    candidateHas: Boolean(candidate.dob || candidate.dobYear),
    matched: dob.matched,
    strength: dob.strength,
    note: dob.note,
  });
  if (!subject.dob && !subject.dobYear) missing.push("Date of birth (full DD-MM-YYYY ideally)");

  // Passport / national ID
  const id = idMatch(subject, candidate);
  comparisons.push({
    field: "id_number",
    subjectHas: Boolean(subject.passportNumber || subject.nationalIdNumber),
    candidateHas: Boolean(candidate.passportNumber || candidate.nationalIdNumber),
    matched: id.matched,
    strength: id.strength,
    note: id.note,
  });
  if (!subject.passportNumber && !subject.nationalIdNumber) {
    missing.push("Passport or national-ID number");
  }

  // Place of birth
  const pobMatch = subject.placeOfBirth && candidate.placeOfBirth
    && normName(subject.placeOfBirth) === normName(candidate.placeOfBirth);
  comparisons.push({
    field: "place_of_birth",
    subjectHas: Boolean(subject.placeOfBirth),
    candidateHas: Boolean(candidate.placeOfBirth),
    matched: Boolean(pobMatch),
    strength: "strong",
  });
  if (!subject.placeOfBirth) missing.push("Place of birth");

  // Citizenship
  const citiMatch = subject.citizenship && candidate.citizenship
    && normName(subject.citizenship) === normName(candidate.citizenship);
  comparisons.push({
    field: "citizenship",
    subjectHas: Boolean(subject.citizenship),
    candidateHas: Boolean(candidate.citizenship),
    matched: Boolean(citiMatch),
    strength: "weak",
  });

  // Gender
  if (subject.gender && candidate.gender) {
    comparisons.push({
      field: "gender",
      subjectHas: true,
      candidateHas: true,
      matched: subject.gender === candidate.gender,
      strength: "weak",
    });
  }

  // Father's / mother's name (MENA convention)
  if (subject.fatherName || candidate.fatherName) {
    const matched = subject.fatherName && candidate.fatherName
      && nameSimilarity(subject.fatherName, candidate.fatherName) >= 0.9;
    comparisons.push({
      field: "father_name",
      subjectHas: Boolean(subject.fatherName),
      candidateHas: Boolean(candidate.fatherName),
      matched: Boolean(matched),
      strength: "strong",
    });
    if (!subject.fatherName) missing.push("Father's name (MENA convention)");
  }

  // Biometric
  comparisons.push({
    field: "biometric",
    subjectHas: Boolean(subject.hasBiometricMatch),
    candidateHas: false, // sanctions records rarely include biometric
    matched: false,
    strength: "decisive",
    note: subject.hasBiometricMatch ? "Biometric match against issued document" : "Biometric not collected",
  });
  if (!subject.hasBiometricMatch) missing.push("Biometric match (selfie vs issued ID)");

  // ─── Confidence calculation ─────────────────────────────────────────
  const isCommonName = isCommonNameStr(subject.fullName);

  let conf = 0;
  let cap = 1; // ceiling on max achievable confidence given supplied identifiers

  // Name contribution: 0.0 .. 0.4 based on similarity. Common names cap at 0.2.
  conf += Math.min(isCommonName ? 0.2 : 0.4, nameSim * (isCommonName ? 0.25 : 0.4));

  // Decisive identifiers — if matched, jump to high confidence
  if (id.matched && id.strength === "decisive") conf += 0.5;
  if (dob.matched === true) conf += 0.35;
  if (subject.hasBiometricMatch) conf += 0.4;

  // Strong identifiers
  if (pobMatch) conf += 0.15;
  if (subject.fatherName && candidate.fatherName && nameSimilarity(subject.fatherName, candidate.fatherName) >= 0.9) {
    conf += 0.15;
  }

  // Medium / weak
  if (aliasOverlap) conf += 0.1;
  if (dob.matched === "partial") conf += 0.1;
  if (citiMatch) conf += 0.05;
  if (subject.gender && candidate.gender && subject.gender === candidate.gender) conf += 0.02;

  // Cap the confidence ceiling based on what was actually supplied:
  // common-name + weak-identifiers can never exceed 0.5 — the engine
  // refuses to confirm without strong evidence.
  if (isCommonName && !id.matched && dob.matched !== true && !subject.hasBiometricMatch) {
    cap = 0.5;
  }

  conf = Math.max(0, Math.min(cap, conf));

  // ─── Verdict ────────────────────────────────────────────────────────
  let verdict: DisambiguationResult["verdict"];
  if (isCommonName && missing.length >= 3 && conf < 0.7) {
    verdict = "ambiguous_collect_more";
  } else if (conf >= 0.9) verdict = "confirmed_match";
  else if (conf >= 0.7) verdict = "probable_match";
  else if (conf >= 0.4) verdict = "possible_match";
  else if (conf >= 0.15) verdict = "unlikely_match";
  else verdict = "false_positive_likely";

  // Narrative
  const narrative = (() => {
    const parts: string[] = [];
    if (isCommonName) {
      parts.push(`"${subject.fullName}" is a statistically common name — without strong identifiers, hundreds or thousands of records could match.`);
    }
    if (id.matched && id.strength === "decisive") {
      parts.push(`Decisive ID match (${id.note}) — confidence ceiling lifted.`);
    } else if (dob.matched === true) {
      parts.push("Full date-of-birth match supports the link.");
    } else if (subject.hasBiometricMatch) {
      parts.push("Biometric match against issued document confirms identity.");
    } else {
      parts.push(
        `Cannot confirm same-person identity without ${missing.slice(0, 3).join(", ")}.`,
      );
    }
    parts.push(`Confidence ${(conf * 100).toFixed(0)}% — verdict: ${verdict.replace(/_/g, " ").toUpperCase()}.`);
    return parts.join(" ");
  })();

  return {
    confidence: conf,
    verdict,
    missingIdentifiers: missing,
    comparisons,
    isCommonName,
    narrative,
  };
}
