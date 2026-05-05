// Hawkeye Sterling — external-data adapter stubs (Layers #34-36, 38-41).
//
// Pure interface declarations + safe fallback implementations so the
// engine can call into them today without knowing whether real API
// credentials are configured. When credentials land, swap the stub for
// a real fetch implementation; the engine consumers don't change.

// ── #34 HS-code anomaly ────────────────────────────────────────────────
export interface HsCodeReference {
  hsCode: string;
  sectorBand: { minPct: number; maxPct: number }; // typical price-range vs market
  jurisdictionFlags?: string[];
}

export interface HsCodeAdapter {
  isAvailable(): boolean;
  /** Returns the typical price band for a (hsCode, jurisdiction) combo. */
  reference(hsCode: string, originIso2: string): Promise<HsCodeReference | null>;
}

export const NULL_HS_CODE_ADAPTER: HsCodeAdapter = {
  isAvailable: () => false,
  reference: async () => null,
};

// ── #35 Multi-invoicing detector ──────────────────────────────────────
export interface InvoiceRecord {
  id: string;
  customerName: string;
  description: string;
  unitPrice: number;
  quantity: number;
  destinationIso2: string;
  invoicedAt: string;
}

/** Detects same-good multi-invoiced across destinations. */
export function detectMultiInvoicing(invoices: InvoiceRecord[]): Array<{
  signature: string;
  invoiceIds: string[];
  destinations: string[];
  rationale: string;
}> {
  const sigMap = new Map<string, InvoiceRecord[]>();
  for (const inv of invoices) {
    const sig = `${inv.customerName.toLowerCase()}|${inv.description.toLowerCase().slice(0, 80)}|${inv.unitPrice}|${inv.quantity}`;
    const arr = sigMap.get(sig) ?? [];
    arr.push(inv);
    sigMap.set(sig, arr);
  }
  const out: Array<{ signature: string; invoiceIds: string[]; destinations: string[]; rationale: string }> = [];
  for (const [sig, arr] of sigMap.entries()) {
    const dests = Array.from(new Set(arr.map((i) => i.destinationIso2)));
    if (arr.length >= 2 && dests.length >= 2) {
      out.push({
        signature: sig,
        invoiceIds: arr.map((i) => i.id),
        destinations: dests,
        rationale: `Same goods invoiced ${arr.length}× across ${dests.length} destinations (${dests.join(", ")}) — TBML multi-invoicing pattern.`,
      });
    }
  }
  return out;
}

// ── #36 Bust-out fraud pattern ─────────────────────────────────────────
export interface CreditTimeline {
  subjectId: string;
  events: Array<{ at: string; creditLimit: number; outstanding: number; status: "active" | "delinquent" | "default" }>;
}

export function detectBustOut(timeline: CreditTimeline): {
  busted: boolean;
  rationale: string;
  growthRate?: number;
} {
  if (timeline.events.length < 4) return { busted: false, rationale: "Insufficient credit history (need ≥4 events)." };
  const sorted = [...timeline.events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (last.status !== "default") return { busted: false, rationale: "No default event present." };
  if (first.creditLimit === 0) return { busted: false, rationale: "First credit limit is 0; cannot compute growth." };
  const growthRate = (last.creditLimit - first.creditLimit) / first.creditLimit;
  const days = Math.max(1, (Date.parse(last.at) - Date.parse(first.at)) / 86_400_000);
  const annualised = growthRate * (365 / days);
  if (annualised >= 3 && last.outstanding >= last.creditLimit * 0.9) {
    return {
      busted: true,
      growthRate: annualised,
      rationale: `Credit limit grew ${(annualised * 100).toFixed(0)}% annualised, then defaulted at ${((last.outstanding / last.creditLimit) * 100).toFixed(0)}% utilisation — bust-out fraud pattern.`,
    };
  }
  return { busted: false, growthRate: annualised, rationale: `Annualised credit-limit growth ${(annualised * 100).toFixed(0)}% — within tolerance.` };
}

// ── #38 Active-learning feedback loop ──────────────────────────────────
export interface DispositionFeedback {
  subjectId: string;
  modelBand: "clear" | "low" | "medium" | "high" | "critical";
  modelConfidence: number;
  mlroDisposition: "cleared" | "edd" | "frozen" | "declined" | "str_filed";
  decidedAt: string;
}

/** Compute calibration drift between model band and MLRO disposition. */
export function calibrationDrift(records: DispositionFeedback[]): {
  total: number;
  cleared_high_band: number;
  declined_clear_band: number;
  driftScore: number;
  rationale: string;
} {
  let clearedHighBand = 0;
  let declinedClearBand = 0;
  for (const r of records) {
    if ((r.modelBand === "high" || r.modelBand === "critical") && r.mlroDisposition === "cleared") clearedHighBand += 1;
    if (r.modelBand === "clear" && (r.mlroDisposition === "frozen" || r.mlroDisposition === "declined" || r.mlroDisposition === "str_filed")) declinedClearBand += 1;
  }
  const drift = (clearedHighBand + declinedClearBand) / Math.max(1, records.length);
  return {
    total: records.length,
    cleared_high_band: clearedHighBand,
    declined_clear_band: declinedClearBand,
    driftScore: drift,
    rationale: drift >= 0.1
      ? `Calibration drift ${(drift * 100).toFixed(0)}% — retrain / re-tune the model.`
      : `Calibration drift ${(drift * 100).toFixed(0)}% — within tolerance.`,
  };
}

// ── #39 GLEIF LEI lookup ───────────────────────────────────────────────
export interface LeiRecord {
  lei: string;
  legalName: string;
  legalForm?: string;
  registeredAt?: string;
  status?: "ACTIVE" | "INACTIVE" | "LAPSED" | "RETIRED";
  countryIso2?: string;
}

export interface GleifAdapter {
  isAvailable(): boolean;
  /** Looks up a candidate LEI by legal name. */
  lookupByName(legalName: string): Promise<LeiRecord[]>;
}

export const NULL_GLEIF_ADAPTER: GleifAdapter = {
  isAvailable: () => false,
  lookupByName: async () => [],
};

// ── #40 OpenSanctions / OpenCorporates ─────────────────────────────────
export interface CorporateRecord {
  source: string;            // "opencorporates" | "opensanctions"
  jurisdiction: string;
  registrationNumber?: string;
  legalName: string;
  status?: string;
  incorporatedAt?: string;
  officers?: Array<{ name: string; role: string; appointedAt?: string }>;
}

export interface CorporateRegistryAdapter {
  isAvailable(): boolean;
  lookup(name: string, jurisdiction?: string): Promise<CorporateRecord[]>;
}

export const NULL_CORPORATE_ADAPTER: CorporateRegistryAdapter = {
  isAvailable: () => false,
  lookup: async () => [],
};

// ── #41 Crypto on-chain analytics adapter ──────────────────────────────
export interface OnChainAnalytic {
  address: string;
  riskScore: number;       // 0..100 from provider
  cluster?: string;
  exposureSummary: string;
}

export interface OnChainAdapter {
  isAvailable(): boolean;
  analyse(address: string, chain: string): Promise<OnChainAnalytic | null>;
}

export const NULL_ONCHAIN_ADAPTER: OnChainAdapter = {
  isAvailable: () => false,
  analyse: async () => null,
};
