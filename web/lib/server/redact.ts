/**
 * PII redaction for LLM payloads.
 *
 * Before any text leaves this server toward Claude, call redact().
 * After Claude responds, call rehydrate() with the same map.
 *
 * Regulatory basis: UAE PDPL Federal Decree-Law 45/2021 Art.22 (data
 * minimisation), GDPR Art.5(1)(c) (purpose limitation / minimisation).
 *
 * Token format: [REDACTED_TYPE_XXXXXX]
 *   - TYPE  = PII category in SCREAMING_SNAKE_CASE
 *   - XXXXXX = first 6 hex chars of SHA-256(original value)
 *   - Deterministic: same value in same request → same token (safe dedup)
 */

import { createHash } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

/** token → original value */
export type RedactionMap = Record<string, string>;

// ── Luhn check (credit/debit card validation) ─────────────────────────────────

function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i]!, 10);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// ── Token factory ─────────────────────────────────────────────────────────────

function makeToken(type: string, value: string): string {
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 6);
  return `[REDACTED_${type}_${hash}]`;
}

// ── Pattern definitions ───────────────────────────────────────────────────────

interface Pattern {
  type: string;
  re: RegExp;
  validate?: (match: string) => boolean;
}

// Patterns ordered highest-precision first. CARD uses Luhn to eliminate FP.
// IBAN requires exactly 2 uppercase letters then 2 digits then alphanumeric.
const PATTERNS: Pattern[] = [
  // Structured numeric / alphanumeric identifiers (near-zero FP)
  {
    type: "UAE_ID",
    re: /\b784-\d{4}-\d{7}-\d\b/g,
  },
  {
    type: "IBAN",
    re: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g,
    // Filter out short uppercase country-code-like false positives
    validate: (m) => m.length >= 15,
  },
  {
    type: "CARD",
    re: /\b(?:\d{4}[\s\-]?){3}\d{4}\b/g,
    validate: (m) => luhnValid(m.replace(/\D/g, "")),
  },
  {
    type: "ETH_ADDR",
    re: /\b0x[a-fA-F0-9]{40}\b/g,
  },
  {
    type: "BTC_ADDR",
    re: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g,
  },

  // Contact & identity
  {
    type: "EMAIL",
    re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  },
  {
    type: "PHONE",
    re: /(?:\+\d{1,3}[\s\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/g,
  },
  {
    type: "SSN",
    re: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    type: "DOB",
    // Matches DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD.MM.YYYY — requires 4-digit year
    re: /\b(?:(?:0?[1-9]|[12]\d|3[01])[\/\-\.](?:0?[1-9]|1[0-2])[\/\-\.](?:19|20)\d{2}|(?:19|20)\d{2}[-\/\.](?:0?[1-9]|1[0-2])[-\/\.](?:0?[1-9]|[12]\d|3[01]))\b/g,
  },
  {
    type: "IPV4",
    re: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
  },

  // Passport numbers when adjacent to label keywords
  {
    type: "PASSPORT",
    // Requires "Passport", "Passeport", or "PP" label before the number
    re: /(?:Passport(?:\s+(?:No|Number|#|Num))?[:\s]+|Passeport[:\s]+|\bPP[:\s]+)([A-Z]{1,2}\d{6,9})\b/gi,
  },

  // Credential-bearing URLs (http://user:pass@host)
  {
    type: "CRED_URL",
    re: /https?:\/\/[^:\s]+:[^@\s]+@[^\s]+/g,
  },

  // Names following common AML field labels
  {
    type: "NAME",
    re: /(?:(?:Subject|Customer|UBO|Beneficial\s+Owner|Director|Shareholder|Signatory|Counterparty|Sender|Receiver|Beneficiary|Originator|Individual|Person|Client|Account\s+Holder|Guarantor)\s*(?:Name)?\s*:\s*)([A-Z][a-z'\-]{1,25}(?:\s+[A-Z][a-z'\-]{1,25}){1,3})/g,
  },
];

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Redact PII from `text`. Accumulates tokens into `map` (mutates in place).
 * Returns the safe text to send to the LLM.
 */
export function redact(text: string, map: RedactionMap = {}): string {
  let out = text;

  for (const { type, re, validate } of PATTERNS) {
    // Reset lastIndex for each pass (global regexes are stateful)
    re.lastIndex = 0;

    out = out.replace(re, (match, group1?: string) => {
      // For patterns without capture groups, JS passes (match, offset, string)
      // so group1 receives the numeric offset — not a captured string. Guard
      // against that so we never pass a number to createHash().update().
      const value = typeof group1 === "string" ? group1 : match;
      if (validate && !validate(value)) return match;
      const tok = makeToken(type, value);
      map[tok] = value;
      if (group1) {
        // Replace only the captured group, preserve the label prefix
        return match.replace(group1, tok);
      }
      return tok;
    });

    re.lastIndex = 0;
  }

  return out;
}

/**
 * Replace all [REDACTED_TYPE_XXXXXX] tokens in `text` back to originals.
 * Call this on every LLM response text block before returning to the client.
 */
export function rehydrate(text: string, map: RedactionMap): string {
  if (Object.keys(map).length === 0) return text;
  // Escape for regex: brackets and underscores in tokens are literal
  const tokenRe = /\[REDACTED_[A-Z_]+_[0-9a-f]{6}\]/g;
  return text.replace(tokenRe, (tok) => map[tok] ?? tok);
}
