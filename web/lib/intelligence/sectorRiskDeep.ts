// Hawkeye Sterling — specialised sector risk (Layers 232-241).

// 232. NPO terrorism-financing risk
export function npoTfRisk(input: { jurisdictionIso2?: string; cashIntensiveOps?: boolean; crossBorderTransfersUsd?: number }): { score: number; rationale: string } {
  let s = 20;
  const HIGH_RISK = new Set(["AF","SY","YE","SO","SD","LB","PS","IQ","LY","ML","BF","NG"]);
  if (input.jurisdictionIso2 && HIGH_RISK.has(input.jurisdictionIso2.toUpperCase())) s += 35;
  if (input.cashIntensiveOps) s += 20;
  if ((input.crossBorderTransfersUsd ?? 0) >= 100_000) s += 15;
  return { score: Math.min(100, s), rationale: `NPO TF risk score ${s}/100 (FATF R.8 framework).` };
}
// 233. Casino chip-out limit
export function casinoChipOut(input: { dailyChipOutUsd: number; thresholdUsd?: number }): { breached: boolean; rationale: string } {
  const thr = input.thresholdUsd ?? 10_000;
  return { breached: input.dailyChipOutUsd >= thr, rationale: `Daily chip-out USD ${input.dailyChipOutUsd.toLocaleString()} vs threshold USD ${thr.toLocaleString()}.` };
}
// 234. Real-estate beneficial ownership (corporate purchaser → trace UBO)
export function realEstateUboCheck(input: { purchaserType?: "individual" | "corporate" | "trust"; uboMapPresent?: boolean }): { ok: boolean; rationale: string } {
  if (input.purchaserType === "individual") return { ok: true, rationale: "individual purchaser — UBO is the natural person." };
  if (!input.uboMapPresent) return { ok: false, rationale: "Corporate/trust purchaser without UBO map — refuse per FATF R.22." };
  return { ok: true, rationale: "UBO map on file." };
}
// 235. Art-market provenance
export function artProvenance(input: { provenanceBackTo?: number; redListMatch?: boolean; valuationCertified?: boolean }): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!input.provenanceBackTo || input.provenanceBackTo > 1970) issues.push("provenance does not extend back to UNESCO 1970 baseline");
  if (input.redListMatch) issues.push("matches Interpol / WCO red list");
  if (!input.valuationCertified) issues.push("no certified valuation");
  return { ok: issues.length === 0, issues };
}
// 236. Lawyer client-account opacity
export function lawyerClientAccountOpacity(input: { pooled?: boolean; ubosDeclared?: boolean }): { opaque: boolean; rationale: string } {
  if (input.pooled && !input.ubosDeclared) return { opaque: true, rationale: "Pooled client account without per-beneficial-owner declaration — FATF R.22 violation." };
  return { opaque: false, rationale: "client-account structure within tolerance" };
}
// 237. Accountant audit-trail
export function accountantAuditTrail(input: { auditOpinion?: "unqualified" | "qualified" | "adverse" | "disclaimer"; lastAuditYear?: number }): { ok: boolean; rationale: string } {
  if (input.auditOpinion === "adverse" || input.auditOpinion === "disclaimer") return { ok: false, rationale: `Adverse / disclaimer audit opinion (${input.auditOpinion}).` };
  if (input.lastAuditYear && new Date().getFullYear() - input.lastAuditYear > 2) return { ok: false, rationale: `Last audit ${input.lastAuditYear} > 2 years stale.` };
  return { ok: true, rationale: "audit trail current and clean" };
}
// 238. Insurance claim fraud (early-claim red flag)
export function insuranceEarlyClaim(input: { policyStartIso?: string; claimFiledIso?: string }): { suspicious: boolean; daysFromStart: number } {
  if (!input.policyStartIso || !input.claimFiledIso) return { suspicious: false, daysFromStart: 0 };
  const days = (Date.parse(input.claimFiledIso) - Date.parse(input.policyStartIso)) / 86_400_000;
  return { suspicious: days < 60, daysFromStart: Math.round(days) };
}
// 239. Charitable disbursement mapping
export function charitableDisbursementMap(input: { totalReceivedUsd: number; totalDisbursedUsd: number; beneficiaryCount: number }): { suspicious: boolean; ratio: number; rationale: string } {
  if (input.totalReceivedUsd === 0) return { suspicious: false, ratio: 0, rationale: "no inflows" };
  const ratio = input.totalDisbursedUsd / input.totalReceivedUsd;
  if (ratio < 0.3) return { suspicious: true, ratio, rationale: `Only ${(ratio * 100).toFixed(0)}% of inflows disbursed — possible diversion.` };
  if (input.beneficiaryCount === 1) return { suspicious: true, ratio, rationale: "Single-beneficiary disbursement pattern unusual for a charity." };
  return { suspicious: false, ratio, rationale: `${(ratio * 100).toFixed(0)}% disbursed across ${input.beneficiaryCount} beneficiaries.` };
}
// 240. Shell-bank correspondent
export function shellBankCheck(input: { hasPhysicalPresence?: boolean; isCorrespondent?: boolean }): { refused: boolean; rationale: string } {
  if (input.isCorrespondent && input.hasPhysicalPresence === false) return { refused: true, rationale: "FATF R.13 — correspondent relationship with shell bank prohibited." };
  return { refused: false, rationale: "physical presence on file" };
}
// 241. Unlicensed MSB
export function unlicensedMsbCheck(input: { isMsb?: boolean; licenceOnFile?: boolean; jurisdictionIso2?: string }): { refused: boolean; rationale: string } {
  if (input.isMsb && !input.licenceOnFile) return { refused: true, rationale: `MSB activity without licence (${input.jurisdictionIso2 ?? "?"}) — refuse per FATF R.14.` };
  return { refused: false, rationale: "licence on file or non-MSB activity" };
}
