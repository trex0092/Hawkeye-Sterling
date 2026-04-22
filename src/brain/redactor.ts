// Hawkeye Sterling — regulator-safe PII redactor.
// Strips / masks personally identifying information from an outbound text
// copy so the redacted version can be shared outside of the privileged
// MLRO channel (e.g. included in a board pack summary, a peer-benchmark
// submission, or a training example). NEVER used on the STR/FFR/PNMR
// filing itself — those must carry the real identifiers.
//
// Detection is pattern-based (no NER call); false positives are tolerable
// because the tool errs toward over-redaction.

export type RedactionKind =
  | 'email' | 'phone_e164' | 'iban' | 'passport' | 'national_id' | 'emirates_id'
  | 'credit_card' | 'wallet_address' | 'bic_swift' | 'imo_number' | 'ipv4'
  | 'pep_title' | 'address_line' | 'date' | 'amount';

export interface RedactionRule {
  kind: RedactionKind;
  pattern: RegExp;
  mask: (match: string) => string;
}

function keep(prefix: number, suffix: number, mask = '*'): (s: string) => string {
  return (s) => {
    if (s.length <= prefix + suffix) return mask.repeat(s.length);
    return s.slice(0, prefix) + mask.repeat(Math.max(3, s.length - prefix - suffix)) + s.slice(-suffix);
  };
}

export const REDACTION_RULES: RedactionRule[] = [
  { kind: 'email', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, mask: (s) => s.replace(/(?<=.).(?=[^@]*@)/g, '*') },
  { kind: 'phone_e164', pattern: /\+?\d[\d\s\-()]{6,}\d/g, mask: keep(3, 2) },
  { kind: 'iban', pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, mask: keep(4, 4) },
  { kind: 'bic_swift', pattern: /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g, mask: keep(4, 0) },
  { kind: 'passport', pattern: /\b[A-Z]{1,2}\d{6,9}\b/g, mask: keep(2, 0) },
  { kind: 'emirates_id', pattern: /\b784[- ]?\d{4}[- ]?\d{7}[- ]?\d\b/g, mask: () => '784-****-*******-*' },
  { kind: 'national_id', pattern: /\b\d{9,15}\b/g, mask: keep(2, 2) },
  { kind: 'credit_card', pattern: /\b(?:\d[ -]?){12,18}\d\b/g, mask: keep(0, 4) },
  { kind: 'wallet_address', pattern: /\b(?:0x[a-fA-F0-9]{40}|bc1[ac-hj-np-z02-9]{25,39}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|T[A-Za-z1-9]{33})\b/g, mask: keep(6, 4) },
  { kind: 'imo_number', pattern: /\bIMO\s?\d{7}\b/gi, mask: keep(3, 0) },
  { kind: 'ipv4', pattern: /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}\b/g, mask: keep(0, 0, '·') },
  { kind: 'date', pattern: /\b\d{4}-\d{2}-\d{2}\b|\b\d{2}[\/\-.]\d{2}[\/\-.]\d{2,4}\b/g, mask: () => 'YYYY-MM-DD' },
  { kind: 'amount', pattern: /\b(?:AED|USD|EUR|GBP|SAR|QAR)\s?\d{1,3}(?:[,]\d{3})*(?:\.\d{2})?\b/g, mask: (s) => s.replace(/\d/g, '#') },
  { kind: 'pep_title', pattern: /\b(?:H\.H\.|Sheikh|Sheikha|Shaikh|Shaykh|Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.|Hon\.|Sir|Dame)\s+[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,3}/g, mask: (_s) => '[PEP_TITLE]' },
  { kind: 'address_line', pattern: /\b\d{1,5}\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}\s+(?:Street|St\.|Road|Rd\.|Avenue|Ave\.|Boulevard|Blvd\.|Lane|Ln\.|Highway|Hwy\.)\b/g, mask: () => '[ADDRESS]' },
];

export interface RedactionResult {
  redacted: string;
  counts: Partial<Record<RedactionKind, number>>;
  total: number;
}

export function redact(text: string, kinds?: readonly RedactionKind[]): RedactionResult {
  const allow = kinds && kinds.length ? new Set(kinds) : null;
  const counts: Partial<Record<RedactionKind, number>> = {};
  let out = text;
  for (const rule of REDACTION_RULES) {
    if (allow && !allow.has(rule.kind)) continue;
    let n = 0;
    out = out.replace(rule.pattern, (m) => { n++; return rule.mask(m); });
    if (n > 0) counts[rule.kind] = n;
  }
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  return { redacted: out, counts, total };
}

/** Redact + sign: compute a stable FNV-1a fingerprint of the redacted form
 *  so the downstream recipient can verify the same input yields the same
 *  output (and thus that no one tampered with the redacted copy). */
export function redactAndSign(text: string, kinds?: readonly RedactionKind[]): RedactionResult & { fingerprint: string } {
  const r = redact(text, kinds);
  let h = 0x811c9dc5;
  for (let i = 0; i < r.redacted.length; i++) {
    h ^= r.redacted.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return { ...r, fingerprint: (h >>> 0).toString(16).padStart(8, '0') };
}
