// Hawkeye Sterling — common-name disambiguation.
//
// Names like "Mohamed Ali", "John Smith", "Kim", "Wang", "Chen" produce
// thousands of false-positive watchlist matches because they're genuinely
// shared by millions of people. World Check / Dow Jones treat such hits
// as inconclusive without additional identifiers (DOB, nationality,
// passport, document number).
//
// We follow the same approach: detect common names, flag them in the UI,
// and require corroborating identifiers before letting a name-only match
// drive a POSITIVE rating.

// Curated list of the ~200 most common given+surname combinations across
// major naming traditions. Exact-match (case-insensitive). Order doesn't
// matter — matching is set-membership.
const COMMON_NAMES = new Set<string>([
  // Arabic-tradition (extremely common — Muhammad/Mohamed/Mohammed/Ahmed
  // are by some measures the most common male names worldwide)
  "muhammad", "mohamed", "mohammed", "mohammad", "muhammed",
  "ahmed", "ahmad", "ali", "hassan", "hussein", "hussain",
  "ibrahim", "yousef", "yusuf", "khalid", "omar", "osama",
  "abdullah", "abdul rahman", "abdul aziz", "abdul karim",
  "muhammad ali", "mohamed ali", "ahmed ali", "ali ahmed",
  "ali hassan", "muhammad hassan", "mohamed hassan",
  "ahmed hassan", "ahmed mohamed", "mohamed ahmed",
  "muhammad ibrahim", "ali muhammad",
  // Common Pakistani / South Asian
  "muhammad khan", "ali khan", "imran khan", "khan", "shah",
  // English
  "john smith", "james smith", "michael smith", "david smith",
  "robert smith", "william smith", "david jones", "john jones",
  "michael jones", "david brown", "michael brown", "james brown",
  "john brown", "david wilson", "michael wilson", "james wilson",
  "john taylor", "michael taylor", "david taylor", "james taylor",
  "john williams", "james williams", "michael williams",
  "robert johnson", "michael johnson", "james johnson",
  "david johnson", "john johnson",
  "smith", "jones", "brown", "wilson", "taylor", "williams",
  "johnson", "miller", "davis",
  // Spanish / Portuguese
  "jose garcia", "juan garcia", "maria garcia", "jose lopez",
  "juan lopez", "maria lopez", "jose rodriguez", "juan rodriguez",
  "maria rodriguez", "jose martinez", "juan martinez",
  "maria martinez", "jose hernandez", "juan hernandez",
  "maria gonzalez", "jose gonzalez", "juan gonzalez",
  "carlos silva", "joao silva", "maria silva", "joao santos",
  "maria santos", "joao oliveira", "carlos oliveira",
  "garcia", "lopez", "rodriguez", "martinez", "hernandez",
  "gonzalez", "silva", "santos", "oliveira", "perez", "sanchez",
  // East Asian — these are surnames in CJK convention; if name string is
  // just one of these it's almost guaranteed common
  "wang", "li", "zhang", "liu", "chen", "yang", "huang", "zhao",
  "wu", "zhou", "xu", "sun", "ma", "zhu", "hu", "guo", "he",
  "lin", "luo", "zheng", "liang", "song", "tang", "han", "feng",
  "kim", "lee", "park", "choi", "jung", "kang", "cho", "yoon",
  "tanaka", "suzuki", "sato", "takahashi", "watanabe", "ito",
  "yamamoto", "nakamura", "kobayashi", "saito", "kato",
  "wang wei", "li wei", "li ming", "zhang wei", "wang fang",
  "kim min-jun", "park ji-min", "kim su-bin",
  // Russian / Slavic
  "ivan ivanov", "alexander ivanov", "sergey ivanov",
  "ivanov", "petrov", "sidorov", "smirnov", "popov", "vasiliev",
  "kuznetsov", "sokolov", "mikhailov",
  // Vietnamese (Nguyen is held by ~40% of Vietnamese people)
  "nguyen", "tran", "le", "pham", "huynh", "phan", "vu", "vo",
  "nguyen van", "nguyen thi", "tran van", "le van",
  // Indian
  "rajesh kumar", "amit kumar", "anil kumar", "sunil kumar",
  "rakesh kumar", "kumar", "singh", "patel", "shah", "sharma",
  "gupta", "mehta", "agarwal", "rajesh sharma", "amit sharma",
  // African
  "okafor", "okoye", "adeyemi", "adebayo", "ogundimu", "okonkwo",
  "kamau", "wanjiku", "mwangi", "njoroge", "ndlovu", "dlamini",
  // Italian / French / German
  "rossi", "russo", "ferrari", "esposito", "bianchi",
  "martin", "bernard", "thomas", "petit", "robert",
  "muller", "schmidt", "schneider", "fischer", "weber", "meyer",
]);

const NAME_AMBIGUITY_THRESHOLD = 0.35;

export interface CommonNameAssessment {
  isCommon: boolean;
  ambiguityScore: number;        // 0..1 — higher = more ambiguous
  matchedTokens: string[];        // tokens from input that hit the common-name set
  reason: string;
  recommendation: string;
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")          // strip diacritics
    .replace(/[^\p{L}\s'-]/gu, "")   // letters + spaces only
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true when the input name is in our curated common-name set,
 * or a 2-token reordering / partial of it. Examples that all flag:
 *   "Mohamed Ali" / "Ali Mohamed" / "Mohamed" / "Ali"
 *   "John Smith" / "Smith, John" / "JOHN  SMITH"
 */
export function assessCommonName(name: string): CommonNameAssessment {
  const norm = normalize(name);
  if (!norm) {
    return {
      isCommon: false,
      ambiguityScore: 0,
      matchedTokens: [],
      reason: "Empty name",
      recommendation: "Provide a non-empty subject name",
    };
  }

  const tokens = norm.split(" ").filter(Boolean);
  const matchedTokens: string[] = [];

  // Direct match on the full normalized name
  if (COMMON_NAMES.has(norm)) {
    matchedTokens.push(norm);
  }
  // Reversed token match (handles "Ali Mohamed" vs "Mohamed Ali")
  if (tokens.length >= 2) {
    const reversed = [...tokens].reverse().join(" ");
    if (COMMON_NAMES.has(reversed)) matchedTokens.push(reversed);
  }
  // Each individual token (catches "Mohamed" alone or "Smith" alone)
  for (const t of tokens) {
    if (COMMON_NAMES.has(t)) matchedTokens.push(t);
  }
  // Pairwise (any 2-token combination)
  if (tokens.length >= 2) {
    for (let i = 0; i < tokens.length - 1; i++) {
      const pair = `${tokens[i]} ${tokens[i + 1]}`;
      if (COMMON_NAMES.has(pair)) matchedTokens.push(pair);
    }
  }

  const dedupedMatched = Array.from(new Set(matchedTokens));
  // Ambiguity score: full-name match = 1.0; both tokens common = 0.8;
  // single token common = 0.4
  let ambiguityScore = 0;
  if (COMMON_NAMES.has(norm)) ambiguityScore = 1.0;
  else if (tokens.length >= 2 && tokens.every((t) => COMMON_NAMES.has(t))) ambiguityScore = 0.8;
  else if (dedupedMatched.length >= 1) ambiguityScore = 0.4;

  const isCommon = ambiguityScore >= NAME_AMBIGUITY_THRESHOLD;

  let reason: string;
  let recommendation: string;
  if (isCommon) {
    reason = `Name "${name}" is shared by millions of people worldwide (matched: ${dedupedMatched.slice(0, 3).join(", ")}). Watchlist hits on this name alone are not sufficient to identify the subject.`;
    recommendation = "Provide additional identifiers — date of birth, nationality, passport number, or national ID — before treating any match as POSITIVE. Absent these, every name-match must be manually verified against the candidate record.";
  } else {
    reason = "Name does not match the common-name registry; standard matching applies.";
    recommendation = "Standard CDD discriminators apply.";
  }

  return {
    isCommon,
    ambiguityScore,
    matchedTokens: dedupedMatched,
    reason,
    recommendation,
  };
}

/**
 * Returns a multiplier in [0, 1] to apply to a name-only match score
 * when the subject has insufficient identifier corroboration.
 *
 * - 1.0 = no penalty (subject has DOB + nationality + ID)
 * - 0.5 = moderate penalty (subject has 1 of 3 discriminators)
 * - 0.2 = heavy penalty (subject is just a common name with no identifiers)
 */
export function discriminatorPenalty(opts: {
  isCommonName: boolean;
  hasDob: boolean;
  hasNationality: boolean;
  hasIdNumber: boolean;
}): number {
  if (!opts.isCommonName) return 1.0;
  const discriminatorCount =
    (opts.hasDob ? 1 : 0) +
    (opts.hasNationality ? 1 : 0) +
    (opts.hasIdNumber ? 1 : 0);
  switch (discriminatorCount) {
    case 0: return 0.2;     // common name + nothing else → must be manually verified
    case 1: return 0.5;
    case 2: return 0.8;
    default: return 1.0;    // all 3 — full strength
  }
}
