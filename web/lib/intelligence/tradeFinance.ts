// Hawkeye Sterling — trade finance red-flag pack (Layers 116-123).

export interface LcRecord {
  lcRef: string;
  applicant: string;
  beneficiary: string;
  amountUsd: number;
  goodsDescription: string;
  hsCode?: string;
  declaredQty?: number;
  unitPriceUsd?: number;
  shippedQty?: number;
  loadingPort?: string;
  dischargePort?: string;
  bls?: BlRecord[];
}

export interface BlRecord {
  blNumber: string;
  vesselName?: string;
  imo?: string;
  shipper?: string;
  consignee?: string;
  notify?: string;
  declaredWeightKg?: number;
  containerCount?: number;
  endUserCertOnFile?: boolean;
}

// 116. LC over-shipment
export function lcOverShipment(lc: LcRecord): { fired: boolean; rationale: string } {
  if (!lc.declaredQty || !lc.shippedQty) return { fired: false, rationale: "qty data incomplete" };
  const ratio = lc.shippedQty / lc.declaredQty;
  if (ratio > 1.05) return { fired: true, rationale: `Shipped ${ratio.toFixed(2)}× declared qty — possible over-shipment / hidden goods.` };
  return { fired: false, rationale: "shipment within tolerance" };
}

// 117. LC under-shipment
export function lcUnderShipment(lc: LcRecord): { fired: boolean; rationale: string } {
  if (!lc.declaredQty || !lc.shippedQty) return { fired: false, rationale: "qty data incomplete" };
  const ratio = lc.shippedQty / lc.declaredQty;
  if (ratio < 0.85) return { fired: true, rationale: `Shipped only ${(ratio * 100).toFixed(0)}% of declared qty — possible value-transfer scheme.` };
  return { fired: false, rationale: "shipment within tolerance" };
}

// 118. Bill-of-Lading discrepancy detector
export function blDiscrepancy(lc: LcRecord): Array<{ blRef: string; issue: string }> {
  const out: Array<{ blRef: string; issue: string }> = [];
  for (const bl of lc.bls ?? []) {
    if (!bl.imo) out.push({ blRef: bl.blNumber, issue: "BL has no IMO — vessel cannot be screened" });
    if (bl.notify && bl.consignee && bl.notify === bl.consignee) {
      out.push({ blRef: bl.blNumber, issue: "Notify-party = Consignee — common TBML pattern" });
    }
    if (bl.containerCount && bl.declaredWeightKg) {
      const kgPerContainer = bl.declaredWeightKg / bl.containerCount;
      if (kgPerContainer < 1000) out.push({ blRef: bl.blNumber, issue: `Implausibly light cargo (${kgPerContainer.toFixed(0)}kg per container).` });
    }
  }
  return out;
}

// 119. Triangulation route detector (loading != shipper jurisdiction != consignee jurisdiction)
export function triangulation(lc: LcRecord): { triangulated: boolean; rationale: string } {
  if (!lc.bls || lc.bls.length === 0) return { triangulated: false, rationale: "no BLs" };
  for (const bl of lc.bls) {
    if (bl.shipper && bl.consignee && lc.loadingPort && lc.dischargePort) {
      // Crude string heuristic — full would lookup port → ISO2.
      if (lc.loadingPort !== lc.dischargePort && bl.shipper !== bl.consignee) {
        return { triangulated: true, rationale: `Triangular route detected (loading ${lc.loadingPort}, discharge ${lc.dischargePort}, parties differ) — investigate underlying commercial purpose.` };
      }
    }
  }
  return { triangulated: false, rationale: "linear flow" };
}

// 120. Free-zone red flag (FZ entity invoicing FZ entity in different FZ)
const FZ_NAMING_HINTS = /\bfze\b|\bfzco\b|free\s+zone|dmcc|jafza|adgm|difc/i;
export function freeZoneRedFlag(lc: LcRecord): { fired: boolean; rationale: string } {
  if (FZ_NAMING_HINTS.test(lc.applicant) && FZ_NAMING_HINTS.test(lc.beneficiary)) {
    return { fired: true, rationale: "Both applicant and beneficiary are Free-Zone entities — apply enhanced substance test." };
  }
  return { fired: false, rationale: "No Free-Zone-only pattern." };
}

// 121. Goods-description vs HS code consistency
export function hsCodeMismatch(lc: LcRecord, hsLookup: Record<string, RegExp>): { mismatch: boolean; rationale: string } {
  if (!lc.hsCode) return { mismatch: false, rationale: "no HS code" };
  const expected = hsLookup[lc.hsCode];
  if (!expected) return { mismatch: false, rationale: `HS ${lc.hsCode} not in reference — cannot validate.` };
  if (!expected.test(lc.goodsDescription)) {
    return { mismatch: true, rationale: `Goods description "${lc.goodsDescription.slice(0, 60)}…" does not match HS ${lc.hsCode} reference.` };
  }
  return { mismatch: false, rationale: "consistent" };
}

// 122. Dual-use goods detector
const DUAL_USE_KEYWORDS = [
  /\bcentrifuge\b/i, /\baluminum\s+tube\b/i, /\bvacuum\s+pump\b/i,
  /\bgas\s+turbine\b/i, /\bdrone\b/i, /\bUAV\b/, /\bencryption\s+module\b/i,
  /\bnight\s+vision\b/i, /\bradiation\s+detect\b/i, /\bcarbon\s+fibre\b/i,
  /\bspecialty\s+steel\b/i, /\bmaraging\s+steel\b/i, /\bgyroscop/i,
];
export function dualUseDetector(description: string): Array<string> {
  const hits: string[] = [];
  for (const pat of DUAL_USE_KEYWORDS) {
    const m = description.match(pat);
    if (m) hits.push(m[0]);
  }
  return hits;
}

// 123. End-user certificate verifier
export function endUserCertCheck(lc: LcRecord, sensitiveHsCodes: Set<string>): { required: boolean; missing: boolean; rationale: string } {
  const required = lc.hsCode ? sensitiveHsCodes.has(lc.hsCode) : false;
  if (!required) return { required: false, missing: false, rationale: "No EUC requirement for this HS code." };
  const blsWithCert = (lc.bls ?? []).filter((b) => b.endUserCertOnFile === true);
  const missing = blsWithCert.length === 0;
  return {
    required: true,
    missing,
    rationale: missing ? "End-user certificate REQUIRED for sensitive HS code but absent on every BL." : "EUC on file.",
  };
}
