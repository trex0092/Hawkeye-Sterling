// Hawkeye Sterling — network forensics (Layers 181-190).

// 181. Tor exit-node detection
export function torExit(ip: string, exitList: Set<string>): boolean { return exitList.has(ip); }
// 182. Open-proxy database
export function openProxy(ip: string, list: Set<string>): boolean { return list.has(ip); }
// 183. Residential-proxy detection
export function residentialProxy(asn: string | undefined): boolean {
  const SUSPECT = new Set(["AS9009", "AS210644", "AS47787"]); // common residential-proxy ASNs
  return Boolean(asn) && SUSPECT.has(asn!);
}
// 184. Datacenter-IP block
export function datacenterIp(asn: string | undefined): boolean {
  const DC = new Set(["AS14061", "AS16509", "AS15169", "AS13335", "AS8075"]); // DigitalOcean, AWS, GCP, Cloudflare, Azure
  return Boolean(asn) && DC.has(asn!);
}
// 185. Botnet C&C overlap
export function botnetOverlap(ip: string, knownC2: Set<string>): boolean { return knownC2.has(ip); }
// 186. ASN reputation
export function asnReputation(asn: string | undefined, badAsns: Set<string>): { tier: "good" | "neutral" | "bad" } {
  if (!asn) return { tier: "neutral" };
  if (badAsns.has(asn)) return { tier: "bad" };
  return { tier: "neutral" };
}
// 187. DNS-record fingerprint
export function dnsFingerprint(records: { mx: string[]; txt: string[]; ns: string[] }): string {
  const sig = [records.mx.sort().join(","), records.txt.sort().join(","), records.ns.sort().join(",")].join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < sig.length; i += 1) { h ^= sig.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
// 188. SSL cert fingerprint
export function sslCertCheck(input: { issuer?: string; notAfter?: string; subjectAltNames?: string[]; declaredDomain?: string }): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!input.issuer) issues.push("no cert issuer");
  if (input.notAfter && Date.parse(input.notAfter) < Date.now()) issues.push("cert expired");
  if (input.declaredDomain && input.subjectAltNames && !input.subjectAltNames.some((s) => s === input.declaredDomain)) issues.push("SAN mismatch with declared domain");
  return { ok: issues.length === 0, issues };
}
// 189. Email DKIM/SPF/DMARC
export function emailAuth(input: { dkim?: "pass" | "fail"; spf?: "pass" | "fail"; dmarc?: "pass" | "fail" }): { ok: boolean; failed: string[] } {
  const failed: string[] = [];
  if (input.dkim && input.dkim !== "pass") failed.push("DKIM");
  if (input.spf && input.spf !== "pass") failed.push("SPF");
  if (input.dmarc && input.dmarc !== "pass") failed.push("DMARC");
  return { ok: failed.length === 0, failed };
}
// 190. WHOIS/RDAP creation date
export function whoisAge(createdIso: string | undefined, nowMs = Date.now()): { ageDays: number; suspicious: boolean } {
  if (!createdIso) return { ageDays: 0, suspicious: true };
  const t = Date.parse(createdIso);
  if (!Number.isFinite(t)) return { ageDays: 0, suspicious: true };
  const days = (nowMs - t) / 86400000;
  return { ageDays: Math.round(days), suspicious: days < 30 };
}
