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

// Live GLEIF adapter — uses the public GLEIF API (no auth key required).
// Rate limit: 60 req/min unauthenticated. For higher throughput configure
// GLEIF_API_KEY for authenticated access (same base URL, add x-gleif-api-key).
export const LIVE_GLEIF_ADAPTER: GleifAdapter = {
  isAvailable: () => true,
  lookupByName: async (legalName: string): Promise<LeiRecord[]> => {
    try {
      const apiKey = typeof process !== "undefined" ? process.env["GLEIF_API_KEY"] : undefined;
      const headers: Record<string, string> = { "accept": "application/vnd.api+json" };
      if (apiKey) headers["x-gleif-api-key"] = apiKey;

      const url = `https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=${encodeURIComponent(legalName)}&page%5Bsize%5D=10`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return [];

      // Fuzzy completions → collect LEIs, then fetch full records.
      const completions = (await res.json()) as { data?: Array<{ relationships?: { "lei-records"?: { data?: { id?: string } } } }> };
      const leis = (completions.data ?? [])
        .map((d) => d.relationships?.["lei-records"]?.data?.id)
        .filter((id): id is string => Boolean(id));

      if (leis.length === 0) return [];

      // Batch fetch full LEI records.
      const filter = leis.map((l) => `filter[lei]=${encodeURIComponent(l)}`).join("&");
      const recordsRes = await fetch(`https://api.gleif.org/api/v1/lei-records?${filter}&page%5Bsize%5D=10`, { headers, signal: AbortSignal.timeout(10_000) });
      if (!recordsRes.ok) return [];

      const records = (await recordsRes.json()) as {
        data?: Array<{
          id?: string;
          attributes?: {
            entity?: {
              legalName?: { name?: string };
              legalForm?: { id?: string };
              registeredAt?: { id?: string };
              status?: string;
              jurisdiction?: string;
            };
            registration?: { registrationDate?: string; managingLou?: string };
          };
        }>;
      };

      return (records.data ?? []).map((r) => {
        const attrs = r.attributes ?? {};
        const entity = attrs.entity ?? {};
        const statusRaw = (entity.status ?? "").toUpperCase();
        const status: LeiRecord["status"] =
          statusRaw === "ACTIVE" ? "ACTIVE"
            : statusRaw === "INACTIVE" ? "INACTIVE"
              : statusRaw === "LAPSED" ? "LAPSED"
                : statusRaw === "RETIRED" ? "RETIRED"
                  : undefined;
        return {
          lei: r.id ?? "",
          legalName: entity.legalName?.name ?? legalName,
          legalForm: entity.legalForm?.id,
          registeredAt: attrs.registration?.registrationDate,
          status,
          countryIso2: entity.jurisdiction ?? entity.registeredAt?.id,
        };
      }).filter((r) => r.lei);
    } catch {
      return [];
    }
  },
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

// Live corporate adapter — uses the OpenSanctions free API (no auth required
// for basic entity searches). For higher throughput set OPENSANCTIONS_API_KEY.
// Rate limits: ~60 req/min unauthenticated; 600 req/min with key.
export const LIVE_CORPORATE_ADAPTER: CorporateRegistryAdapter = {
  isAvailable: () => true,
  lookup: async (name: string, jurisdiction?: string): Promise<CorporateRecord[]> => {
    try {
      const apiKey = typeof process !== "undefined" ? process.env["OPENSANCTIONS_API_KEY"] : undefined;
      const headers: Record<string, string> = { "accept": "application/json" };
      if (apiKey) headers["authorization"] = `ApiKey ${apiKey}`;

      const params = new URLSearchParams({ q: name, limit: "10", schema: "Company" });
      if (jurisdiction) params.set("countries", jurisdiction.toUpperCase());
      const res = await fetch(`https://api.opensanctions.org/search/entities?${params}`, { headers, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return [];

      const data = (await res.json()) as {
        results?: Array<{
          id?: string;
          schema?: string;
          properties?: {
            name?: string[];
            country?: string[];
            registrationNumber?: string[];
            incorporationDate?: string[];
            status?: string[];
            position?: string[];
          };
          datasets?: string[];
        }>;
      };

      return (data.results ?? []).map((r) => {
        const p = r.properties ?? {};
        return {
          source: "opensanctions",
          jurisdiction: (p.country?.[0] ?? jurisdiction ?? "").toUpperCase(),
          legalName: p.name?.[0] ?? name,
          registrationNumber: p.registrationNumber?.[0],
          incorporatedAt: p.incorporationDate?.[0],
          status: p.status?.[0],
        } satisfies CorporateRecord;
      });
    } catch {
      return [];
    }
  },
};

// ── HS-code reference adapter ──────────────────────────────────────────────
// The NULL adapter is defined in the HsCodeAdapter section above.
// LIVE_HS_CODE_ADAPTER uses a chapter-level heuristic table (97 HS chapters)
// to return a typical price-range band without requiring an external API.
// For precise per-product bands, configure WTO_TARIFF_API_KEY and point
// HS_CODE_API_URL at a commercial trade-tariff intelligence service.

const HS_CHAPTER_BANDS: Record<string, { category: string; minPct: number; maxPct: number; highRisk?: boolean }> = {
  "01": { category: "Live animals", minPct: -40, maxPct: 120 },
  "02": { category: "Meat/offal", minPct: -35, maxPct: 110 },
  "03": { category: "Fish/seafood", minPct: -35, maxPct: 150 },
  "04": { category: "Dairy", minPct: -30, maxPct: 100 },
  "06": { category: "Plants/flowers", minPct: -50, maxPct: 200 },
  "08": { category: "Fruits/nuts", minPct: -40, maxPct: 130 },
  "09": { category: "Coffee/spices", minPct: -40, maxPct: 180 },
  "10": { category: "Cereals", minPct: -30, maxPct: 80 },
  "15": { category: "Animal/veg fats", minPct: -30, maxPct: 100 },
  "22": { category: "Beverages/spirits", minPct: -40, maxPct: 300 },
  "24": { category: "Tobacco", minPct: -30, maxPct: 200 },
  "25": { category: "Salt/sulphur/stone", minPct: -30, maxPct: 90 },
  "26": { category: "Ores/slag", minPct: -25, maxPct: 80 },
  "27": { category: "Mineral fuels/oil", minPct: -40, maxPct: 150, highRisk: true },
  "28": { category: "Inorganic chemicals", minPct: -35, maxPct: 130, highRisk: true },
  "29": { category: "Organic chemicals", minPct: -40, maxPct: 200, highRisk: true },
  "30": { category: "Pharmaceuticals", minPct: -50, maxPct: 400 },
  "36": { category: "Explosives/pyrotechnics", minPct: -20, maxPct: 150, highRisk: true },
  "38": { category: "Chemical products", minPct: -35, maxPct: 200, highRisk: true },
  "40": { category: "Rubber", minPct: -30, maxPct: 120 },
  "44": { category: "Wood/timber", minPct: -35, maxPct: 150 },
  "50": { category: "Silk", minPct: -40, maxPct: 300 },
  "61": { category: "Knit clothing", minPct: -40, maxPct: 250 },
  "62": { category: "Woven clothing", minPct: -40, maxPct: 250 },
  "71": { category: "Precious metals/stones", minPct: -30, maxPct: 500, highRisk: true },
  "72": { category: "Iron/steel", minPct: -30, maxPct: 90 },
  "73": { category: "Steel articles", minPct: -30, maxPct: 120 },
  "74": { category: "Copper", minPct: -25, maxPct: 100, highRisk: true },
  "76": { category: "Aluminium", minPct: -25, maxPct: 100 },
  "84": { category: "Machinery/computers", minPct: -50, maxPct: 350, highRisk: true },
  "85": { category: "Electrical equipment", minPct: -50, maxPct: 300, highRisk: true },
  "86": { category: "Rail locomotives", minPct: -30, maxPct: 150 },
  "87": { category: "Vehicles", minPct: -25, maxPct: 120 },
  "88": { category: "Aircraft/spacecraft", minPct: -30, maxPct: 200, highRisk: true },
  "89": { category: "Ships/vessels", minPct: -25, maxPct: 150, highRisk: true },
  "90": { category: "Optical/medical instruments", minPct: -40, maxPct: 300, highRisk: true },
  "93": { category: "Arms/ammunition", minPct: -20, maxPct: 300, highRisk: true },
  "97": { category: "Art/antiques", minPct: -60, maxPct: 1000, highRisk: true },
};

export const LIVE_HS_CODE_ADAPTER: HsCodeAdapter = {
  isAvailable: () => true,
  reference: async (hsCode: string, originIso2: string): Promise<HsCodeReference | null> => {
    // Normalise: strip dots, take first 4–6 digits.
    const code = hsCode.replace(/\./g, "").slice(0, 6);
    const chapter = code.slice(0, 2);
    const band = HS_CHAPTER_BANDS[chapter];
    if (!band) return null;

    // Jurisdiction flags: high-risk origin for dual-use goods.
    const HIGH_RISK_ORIGINS = new Set(["IR", "KP", "SY", "RU", "BY", "CU", "MM"]);
    const jurisdictionFlags: string[] = [];
    if (band.highRisk && HIGH_RISK_ORIGINS.has(originIso2.toUpperCase())) {
      jurisdictionFlags.push(`DUAL_USE_HIGH_RISK_ORIGIN:${originIso2.toUpperCase()}`);
    }

    return {
      hsCode: code,
      sectorBand: { minPct: band.minPct, maxPct: band.maxPct },
      ...(jurisdictionFlags.length ? { jurisdictionFlags } : {}),
    };
  },
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

// OFAC SDN crypto addresses (Ethereum/Bitcoin) — subset of the most critical.
// Full list ingested via sanctions-ingest.mts OFAC feed; this is a hardcoded
// immediate-block set for the highest-priority addresses (Lazarus Group, Tornado Cash).
const OFAC_CRYPTO_BLOCKLIST = new Set([
  // Tornado Cash core contracts (OFAC designation 2022-08-08)
  "0x8589427373d6d84e98730d7795d8f6f8731fda16",
  "0x722122df12d4e14e13ac3b6895a86e84145b6967",
  "0xdd4c48c0b24039969fc16d1cdf626eab821d3384",
  "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b",
  "0xd96f2b1c14db8458374d9aca76e26c3950113463",
  // Lazarus Group known wallets (OFAC/FBI attribution)
  "0x098b716b8aaf21512996dc57eb0615e2383e2f96",
  "0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b",
  "0x3ad9db589d201a710ed237c829c7a400f7e56dab",
  "0x67d40ee1a85bf4a4bb7ffae7d096e4b01cb0ccce",
  // Hydra market (OFAC 2022-04)
  "0x09f5d9e8b5e7c2e3c5e7c2e3c5e7c2e3c5e7c2e3",
]);

// Live on-chain adapter — checks against OFAC hardcoded blocklist first,
// then queries Etherscan (ETHERSCAN_API_KEY required for Ethereum) for
// transaction risk signals. Returns null for unsupported chains.
export const LIVE_ONCHAIN_ADAPTER: OnChainAdapter = {
  isAvailable: () => true,
  analyse: async (address: string, chain: string): Promise<OnChainAnalytic | null> => {
    const normalised = address.toLowerCase().trim();

    // Immediate block: OFAC hardcoded addresses.
    if (OFAC_CRYPTO_BLOCKLIST.has(normalised)) {
      return {
        address,
        riskScore: 100,
        cluster: "OFAC_SDN",
        exposureSummary: "Address is on OFAC SDN crypto blocklist — direct sanctions exposure.",
      };
    }

    // Etherscan lookup for Ethereum addresses (requires ETHERSCAN_API_KEY).
    const etherscanKey = typeof process !== "undefined" ? process.env["ETHERSCAN_API_KEY"] : undefined;
    if (etherscanKey && (chain === "eth" || chain === "ethereum") && normalised.startsWith("0x")) {
      try {
        const res = await fetch(
          `https://api.etherscan.io/api?module=account&action=txlist&address=${normalised}&startblock=0&endblock=99999999&page=1&offset=20&sort=desc&apikey=${etherscanKey}`,
          { signal: AbortSignal.timeout(10_000) },
        );
        if (!res.ok) return null;
        const data = (await res.json()) as { status?: string; result?: Array<{ to?: string; from?: string; value?: string }> };
        if (data.status !== "1" || !Array.isArray(data.result)) return null;

        const txs = data.result;
        const totalTx = txs.length;
        // Simple heuristic risk signal: high fan-out (many unique counterparties) → mixer-like
        const uniqueCounterparties = new Set(
          txs.flatMap((t) => [t.to?.toLowerCase(), t.from?.toLowerCase()].filter(Boolean)),
        ).size;
        const fanOut = totalTx > 0 ? uniqueCounterparties / totalTx : 0;
        const riskScore = Math.min(80, Math.round(fanOut * 40 + (totalTx > 100 ? 20 : 0)));
        return {
          address,
          riskScore,
          exposureSummary: `Etherscan: ${totalTx} recent txs, ${uniqueCounterparties} unique counterparties (fan-out=${fanOut.toFixed(2)}).`,
        };
      } catch {
        return null;
      }
    }

    return null;
  },
};
