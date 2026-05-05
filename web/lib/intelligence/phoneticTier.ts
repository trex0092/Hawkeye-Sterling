// Hawkeye Sterling — extended phonetic matching tier.
//
// Adds Double Metaphone + NYSIIS + Match Rating Approach on top of the
// existing Soundex used by the watchlist matcher. Pure functions, ASCII
// input only — caller is expected to transliterate non-Latin first
// (see transliteration.ts).
//
// References: Lawrence Philips, "The Double Metaphone Search Algorithm"
// (C/C++ Users Journal, 2000); NYSIIS - New York State Identification
// and Intelligence System; Match Rating Approach (Western Airlines, 1977).

const VOWELS = new Set(["A", "E", "I", "O", "U"]);

// ── Double Metaphone ──────────────────────────────────────────────────
//
// Returns up to two encodings — primary + alternate. We use only the
// primary for default matching but expose both so the caller can score
// "soft" matches when the alternate also overlaps.

export function doubleMetaphone(input: string): { primary: string; alternate: string } {
  const w = input.toUpperCase().replace(/[^A-Z]/g, "");
  if (!w) return { primary: "", alternate: "" };

  const len = w.length;
  let primary = "";
  let alternate = "";
  let pos = 0;

  // Skip silent initial letters
  if (/^(GN|KN|PN|WR|PS)/.test(w)) pos = 1;
  if (w[0] === "X") {
    primary += "S";
    alternate += "S";
    pos = 1;
  }

  while (pos < len && (primary.length < 4 || alternate.length < 4)) {
    const c = w[pos] ?? "";
    const next = w[pos + 1] ?? "";
    const next2 = w[pos + 2] ?? "";

    if (VOWELS.has(c)) {
      if (pos === 0) {
        primary += "A";
        alternate += "A";
      }
      pos += 1;
      continue;
    }

    switch (c) {
      case "B":
        primary += "P"; alternate += "P";
        pos += next === "B" ? 2 : 1;
        break;
      case "C":
        if (pos === 0 && /^CHIA/.test(w.slice(pos))) { primary += "K"; alternate += "K"; pos += 4; break; }
        if (next === "H") {
          primary += "X"; alternate += pos === 0 ? "K" : "X";
          pos += 2;
        } else if (next === "I" && next2 === "A") {
          primary += "X"; alternate += "X"; pos += 3;
        } else if (next === "Z") { primary += "S"; alternate += "X"; pos += 2; }
        else if (next === "K" || next === "G" || next === "Q") { primary += "K"; alternate += "K"; pos += 2; }
        else { primary += "K"; alternate += "K"; pos += 1; }
        break;
      case "D":
        if (next === "G") {
          if (next2 === "I" || next2 === "E" || next2 === "Y") { primary += "J"; alternate += "J"; pos += 3; }
          else { primary += "TK"; alternate += "TK"; pos += 2; }
        } else { primary += "T"; alternate += "T"; pos += next === "D" || next === "T" ? 2 : 1; }
        break;
      case "F":
        primary += "F"; alternate += "F";
        pos += next === "F" ? 2 : 1; break;
      case "G":
        if (next === "H") { primary += pos === 0 ? "K" : ""; alternate += pos === 0 ? "K" : ""; pos += 2; }
        else if (next === "N") { primary += "KN"; alternate += "N"; pos += 2; }
        else { primary += "K"; alternate += "K"; pos += next === "G" ? 2 : 1; }
        break;
      case "H":
        if (pos === 0 || (pos > 0 && VOWELS.has(w[pos - 1] ?? ""))) {
          primary += "H"; alternate += "H";
        }
        pos += 1; break;
      case "J":
        primary += "J"; alternate += "A"; pos += 1; break;
      case "K":
        primary += "K"; alternate += "K";
        pos += next === "K" ? 2 : 1; break;
      case "L":
        primary += "L"; alternate += "L";
        pos += next === "L" ? 2 : 1; break;
      case "M":
        primary += "M"; alternate += "M";
        pos += next === "M" ? 2 : 1; break;
      case "N":
        primary += "N"; alternate += "N";
        pos += next === "N" ? 2 : 1; break;
      case "P":
        if (next === "H") { primary += "F"; alternate += "F"; pos += 2; }
        else { primary += "P"; alternate += "P"; pos += next === "P" || next === "B" ? 2 : 1; }
        break;
      case "Q":
        primary += "K"; alternate += "K"; pos += 1; break;
      case "R":
        primary += "R"; alternate += "R";
        pos += next === "R" ? 2 : 1; break;
      case "S":
        if (next === "H") { primary += "X"; alternate += "X"; pos += 2; }
        else if (next === "I" && (next2 === "O" || next2 === "A")) { primary += "S"; alternate += "X"; pos += 3; }
        else { primary += "S"; alternate += "S"; pos += next === "S" || next === "Z" ? 2 : 1; }
        break;
      case "T":
        if (next === "H") { primary += "0"; alternate += "T"; pos += 2; }
        else if (next === "I" && next2 === "O") { primary += "X"; alternate += "X"; pos += 3; }
        else { primary += "T"; alternate += "T"; pos += next === "T" || next === "D" ? 2 : 1; }
        break;
      case "V":
        primary += "F"; alternate += "F"; pos += 1; break;
      case "W":
        if (pos === 0 && next === "H") { primary += "A"; alternate += "F"; pos += 2; }
        else { pos += 1; }
        break;
      case "X":
        primary += "KS"; alternate += "KS"; pos += 1; break;
      case "Z":
        primary += "S"; alternate += "S";
        pos += next === "Z" ? 2 : 1; break;
      default:
        pos += 1;
    }
  }

  return {
    primary: primary.slice(0, 4),
    alternate: alternate.slice(0, 4),
  };
}

// ── NYSIIS ────────────────────────────────────────────────────────────

export function nysiis(input: string): string {
  let w = input.toUpperCase().replace(/[^A-Z]/g, "");
  if (!w) return "";

  // Step 1: prefix transformations
  w = w.replace(/^MAC/, "MCC")
       .replace(/^KN/, "NN")
       .replace(/^K/, "C")
       .replace(/^(PH|PF)/, "FF")
       .replace(/^SCH/, "SSS");

  // Step 2: suffix transformations
  w = w.replace(/(EE|IE)$/, "Y")
       .replace(/(DT|RT|RD|NT|ND)$/, "D");

  // Step 3: build encoded form
  if (w.length === 0) return "";
  let key = w[0]!;
  for (let i = 1; i < w.length; i++) {
    let ch = w[i]!;
    const prev = key[key.length - 1] ?? "";
    if (ch === "E" && w[i + 1] === "V") { ch = "AF"; i++; }
    else if (VOWELS.has(ch)) { ch = "A"; }
    else if (ch === "Q") ch = "G";
    else if (ch === "Z") ch = "S";
    else if (ch === "M") ch = "N";
    else if (ch === "K" && w[i + 1] === "N") { ch = "N"; i++; }
    else if (ch === "K") ch = "C";
    else if (ch === "S" && w[i + 1] === "C" && w[i + 2] === "H") { ch = "SSS"; i += 2; }
    else if (ch === "P" && w[i + 1] === "H") { ch = "FF"; i++; }
    else if (ch === "H" && (!VOWELS.has(prev) || !VOWELS.has(w[i + 1] ?? ""))) ch = prev;
    else if (ch === "W" && VOWELS.has(prev)) ch = prev;
    if (ch !== prev) key += ch;
  }

  // Final cleanup
  if (key.endsWith("S")) key = key.slice(0, -1);
  if (key.endsWith("AY")) key = key.slice(0, -2) + "Y";
  if (key.endsWith("A")) key = key.slice(0, -1);

  return key.slice(0, 6);
}

// ── Match Rating Approach (Western Airlines, 1977) ───────────────────

function mraEncode(s: string): string {
  let w = s.toUpperCase().replace(/[^A-Z]/g, "");
  // Remove non-leading vowels
  w = w[0] + w.slice(1).replace(/[AEIOU]/g, "");
  // Collapse double letters
  w = w.replace(/(.)\1+/g, "$1");
  // First 3 + last 3 if length > 6
  if (w.length > 6) w = w.slice(0, 3) + w.slice(-3);
  return w;
}

export function matchRating(a: string, b: string): { rating: number; threshold: number; match: boolean } {
  const e1 = mraEncode(a);
  const e2 = mraEncode(b);
  const sumLen = e1.length + e2.length;
  // Threshold rules (Western Airlines spec): based on total length
  let threshold: number;
  if (sumLen <= 4) threshold = 5;
  else if (sumLen <= 7) threshold = 4;
  else if (sumLen <= 11) threshold = 3;
  else threshold = 2;

  // Disqualify if length difference > 3
  if (Math.abs(e1.length - e2.length) > 3) {
    return { rating: 0, threshold, match: false };
  }

  // Strip matched chars from left
  const a1 = e1.split("");
  const a2 = e2.split("");
  for (let i = 0; i < a1.length && i < a2.length; i++) {
    if (a1[i] === a2[i]) { a1[i] = ""; a2[i] = ""; }
  }
  // Strip matched chars from right
  for (let i = a1.length - 1, j = a2.length - 1; i >= 0 && j >= 0; ) {
    if (a1[i] === "" || a1[i] === undefined) { i--; continue; }
    if (a2[j] === "" || a2[j] === undefined) { j--; continue; }
    if (a1[i] === a2[j]) { a1[i] = ""; a2[j] = ""; }
    i--; j--;
  }

  const unmatched = a1.filter((c) => c).length + a2.filter((c) => c).length;
  const rating = 6 - Math.ceil(unmatched / 2);
  return { rating: Math.max(0, rating), threshold, match: rating >= threshold };
}

// ── Composite phonetic-tier score ─────────────────────────────────────
//
// Returns 0..1 indicating how confidently the two names sound alike
// using all three algorithms. Caller can use as a "soft" signal layer
// alongside the existing Soundex + edit-distance score.

export interface PhoneticTierResult {
  doubleMetaphone: boolean;
  nysiis: boolean;
  matchRating: boolean;
  matchRatingScore: number;
  compositeScore: number;       // 0..1
}

export function comparePhoneticTier(a: string, b: string): PhoneticTierResult {
  const dm1 = doubleMetaphone(a);
  const dm2 = doubleMetaphone(b);
  const dmMatch =
    (!!dm1.primary && dm1.primary === dm2.primary) ||
    (!!dm1.alternate && dm1.alternate === dm2.alternate) ||
    (!!dm1.primary && dm1.primary === dm2.alternate) ||
    (!!dm1.alternate && dm1.alternate === dm2.primary);

  const ny1 = nysiis(a);
  const ny2 = nysiis(b);
  const nyMatch = !!ny1 && ny1 === ny2;

  const mr = matchRating(a, b);

  const score =
    (dmMatch ? 0.45 : 0) +
    (nyMatch ? 0.35 : 0) +
    (mr.match ? 0.20 : 0);

  return {
    doubleMetaphone: dmMatch,
    nysiis: nyMatch,
    matchRating: mr.match,
    matchRatingScore: mr.rating,
    compositeScore: Math.min(1, score),
  };
}
