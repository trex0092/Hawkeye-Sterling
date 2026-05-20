// Adversarial input detection for the screening engine (Cybersecurity spec item 2).
//
// Checks subject names for patterns that could indicate deliberate manipulation
// to evade sanctions screening:
//  - Unicode homoglyphs (Cyrillic е looks identical to Latin e)
//  - Invisible / zero-width characters
//  - Excessive special chars or unusual length
//  - Same subject screened multiple times with minor variations (replay attack)
//
// Returns a risk level and reason. All findings are HMAC-logged.

import { getJson, setJson } from "./store";

export interface AdversarialCheckResult {
  risk:    "none" | "low" | "high";
  reasons: string[];
}

// Unicode ranges that visually resemble Latin characters but are different code points.
const HOMOGLYPH_RANGES: Array<[number, number, string]> = [
  [0x0400, 0x04FF, "Cyrillic"],    // е, а, р, с look like Latin
  [0x0370, 0x03FF, "Greek"],       // Α, Β look like A, B
  [0x2000, 0x206F, "General Punctuation"],   // zero-width spaces, directional marks
  [0xFEFF, 0xFEFF, "BOM/ZWNBSP"],
];

// Zero-width and invisible characters
const INVISIBLE_CODEPOINTS = new Set([
  0x200B, 0x200C, 0x200D, 0x200E, 0x200F,
  0x202A, 0x202B, 0x202C, 0x202D, 0x202E,
  0xFEFF, 0x00AD,
]);

function hasInvisibleChars(name: string): boolean {
  for (const ch of name) {
    const cp = ch.codePointAt(0) ?? 0;
    if (INVISIBLE_CODEPOINTS.has(cp)) return true;
  }
  return false;
}

function hasHomoglyphs(name: string): boolean {
  // Flag names that mix Latin with Cyrillic or Greek in the same word
  let hasLatin = false;
  let hasCyrillicOrGreek = false;
  for (const ch of name) {
    const cp = ch.codePointAt(0) ?? 0;
    if ((cp >= 0x0041 && cp <= 0x007A) || (cp >= 0x00C0 && cp <= 0x024F)) hasLatin = true;
    if ((cp >= 0x0400 && cp <= 0x04FF) || (cp >= 0x0370 && cp <= 0x03FF)) hasCyrillicOrGreek = true;
  }
  return hasLatin && hasCyrillicOrGreek;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

function replayKey(tenant: string): string {
  return `hs-adversarial/${tenant.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64)}/replay.json`;
}

interface ReplayEntry { name: string; ts: number; }

export async function checkAdversarialInput(
  tenant: string,
  subjectName: string,
): Promise<AdversarialCheckResult> {
  const reasons: string[] = [];
  const normalised = subjectName.normalize("NFC").trim();

  // 1. Invisible / zero-width characters
  if (hasInvisibleChars(normalised)) {
    reasons.push("Name contains invisible or zero-width Unicode characters");
  }

  // 2. Mixed-script homoglyphs
  if (hasHomoglyphs(normalised)) {
    reasons.push("Name mixes Latin with Cyrillic or Greek characters — possible homoglyph substitution");
  }

  // 3. Suspicious length
  if (normalised.length > 120) {
    reasons.push(`Name is unusually long (${normalised.length} chars)`);
  }
  if (normalised.replace(/\s/g, "").length < 2) {
    reasons.push("Name is too short to be meaningful");
  }

  // 4. Replay / near-duplicate detection (same subject screened 3+ times with minor variations in 1h)
  try {
    const key = replayKey(tenant);
    const now = Date.now();
    const window = (await getJson<ReplayEntry[]>(key).catch(() => null)) ?? [];
    const recent = window.filter((e) => now - e.ts < 3_600_000); // 1h window
    const nearDupes = recent.filter(
      (e) => levenshtein(e.name.toLowerCase(), normalised.toLowerCase()) <= 2,
    );
    if (nearDupes.length >= 2) {
      reasons.push(`Subject screened ${nearDupes.length + 1} times with near-identical name in the last hour — possible replay attack`);
    }
    // Persist (cap at 500 entries)
    const updated = [...recent.slice(-499), { name: normalised, ts: now }];
    void setJson(key, updated).catch(() => undefined);
  } catch {
    // Non-critical — do not fail the screening
  }

  const risk: AdversarialCheckResult["risk"] =
    reasons.some((r) => r.includes("invisible") || r.includes("homoglyph") || r.includes("replay"))
      ? "high"
      : reasons.length > 0
        ? "low"
        : "none";

  return { risk, reasons };
}
