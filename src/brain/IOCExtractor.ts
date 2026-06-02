// Hawkeye Sterling — IOC Extractor (Taranis ioc_bot.py analog).
// Extracts Indicators of Compromise from cybercrime / fraud enforcement news:
// IP addresses, file hashes, crypto wallet addresses, SWIFT BICs, LEI numbers.
// Output extends NLPExtractionResult via optional iocs[] field.
//
// All extraction is regex-based — deterministic, zero external dependencies.
// Private/loopback IPs are suppressed; common false-positive patterns filtered.

export type IOCType =
  | 'ipv4'
  | 'ipv6'
  | 'domain'
  | 'md5'
  | 'sha256'
  | 'btc_address'
  | 'eth_address'
  | 'swift_bic'
  | 'lei';

export interface ExtractedIOC {
  type: IOCType;
  value: string;
  sourceArticleIds: string[];
  context: string;         // 80-char window around match
}

// Patterns ordered most-specific → least-specific (SHA256 before MD5, etc.)
const IPV4_RE   = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
const IPV6_RE   = /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{0,4}\b/g;
const SHA256_RE = /\b[0-9a-fA-F]{64}\b/g;
const MD5_RE    = /\b[0-9a-fA-F]{32}\b/g;
// BTC legacy (P2PKH / P2SH) and bech32 segwit
const BTC_LEGACY_RE  = /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g;
const BTC_BECH32_RE  = /\bbc1[a-z0-9]{39,59}\b/gi;
const ETH_RE         = /\b0x[0-9a-fA-F]{40}\b/g;
// SWIFT BIC: 6 alpha bank+country + 2 alphanum location + optional 3 branch (ISO 9362)
const SWIFT_BIC_RE   = /\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g;
// LEI: 18 uppercase alphanumeric + 2 check digits (ISO 17442)
const LEI_RE         = /\b[A-Z0-9]{18}[0-9]{2}\b/g;
// Domain: known TLDs only — avoids matching ordinary words
const DOMAIN_RE = /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|co|uk|de|ru|cn|cc|info|biz|onion)\b/g;

// Private and loopback CIDR prefixes — not threat-relevant
const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|0\.)/;

function extractMatches(
  text: string,
  re: RegExp,
): Array<{ value: string; context: string }> {
  const out: Array<{ value: string; context: string }> = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = Math.max(0, m.index - 40);
    const e = Math.min(text.length, m.index + m[0].length + 40);
    out.push({ value: m[0], context: text.slice(s, e).trim() });
  }
  return out;
}

function dedup(iocs: ExtractedIOC[]): ExtractedIOC[] {
  const map = new Map<string, ExtractedIOC>();
  for (const ioc of iocs) {
    const key = `${ioc.type}:${ioc.value}`;
    const existing = map.get(key);
    if (existing) {
      for (const id of ioc.sourceArticleIds) {
        if (!existing.sourceArticleIds.includes(id)) existing.sourceArticleIds.push(id);
      }
    } else {
      map.set(key, { ...ioc, sourceArticleIds: [...ioc.sourceArticleIds] });
    }
  }
  return Array.from(map.values());
}

/** Extract all IOCs from a block of text. articleId tags each hit's source. */
export function extractIOCs(text: string, articleId: string): ExtractedIOC[] {
  const iocs: ExtractedIOC[] = [];
  const tag = [articleId];

  for (const { value, context } of extractMatches(text, IPV4_RE)) {
    if (PRIVATE_IP_RE.test(value)) continue;
    iocs.push({ type: 'ipv4', value, sourceArticleIds: tag, context });
  }
  for (const { value, context } of extractMatches(text, IPV6_RE)) {
    if (value === '::1' || value.startsWith('fe80')) continue;
    iocs.push({ type: 'ipv6', value, sourceArticleIds: tag, context });
  }
  // SHA256 before MD5 — no length overlap
  for (const { value, context } of extractMatches(text, SHA256_RE)) {
    iocs.push({ type: 'sha256', value: value.toLowerCase(), sourceArticleIds: tag, context });
  }
  for (const { value, context } of extractMatches(text, MD5_RE)) {
    iocs.push({ type: 'md5', value: value.toLowerCase(), sourceArticleIds: tag, context });
  }
  for (const { value, context } of extractMatches(text, BTC_LEGACY_RE)) {
    iocs.push({ type: 'btc_address', value, sourceArticleIds: tag, context });
  }
  for (const { value, context } of extractMatches(text, BTC_BECH32_RE)) {
    iocs.push({ type: 'btc_address', value: value.toLowerCase(), sourceArticleIds: tag, context });
  }
  for (const { value, context } of extractMatches(text, ETH_RE)) {
    iocs.push({ type: 'eth_address', value: value.toLowerCase(), sourceArticleIds: tag, context });
  }
  for (const { value, context } of extractMatches(text, SWIFT_BIC_RE)) {
    if (value.length < 8) continue;
    iocs.push({ type: 'swift_bic', value, sourceArticleIds: tag, context });
  }
  for (const { value, context } of extractMatches(text, LEI_RE)) {
    iocs.push({ type: 'lei', value, sourceArticleIds: tag, context });
  }
  for (const { value, context } of extractMatches(text, DOMAIN_RE)) {
    const low = value.toLowerCase();
    if (/^(and|the|for)\./i.test(low)) continue;
    iocs.push({ type: 'domain', value: low, sourceArticleIds: tag, context });
  }

  return dedup(iocs);
}

/** Merge IOC lists from multiple articles, deduplicating across them. */
export function mergeIOCs(lists: ExtractedIOC[][]): ExtractedIOC[] {
  return dedup(lists.flat());
}
