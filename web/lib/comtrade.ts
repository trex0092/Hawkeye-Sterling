// Client-side utility for querying UN Comtrade trade data via the internal
// /api/comtrade-query route. No API key required — uses the free preview endpoint.

import { fetchJson } from "@/lib/api/fetchWithRetry";

export const PRECIOUS_METALS_HS = {
  "7108": "Gold (unwrought, semi-manufactured, powder)",
  "7106": "Silver (unwrought or semi-manufactured)",
  "7113": "Articles of jewellery and parts",
  "7114": "Articles of goldsmiths/silversmiths wares",
  "7112": "Waste and scrap of precious metals",
} as const;

export type HsCode = keyof typeof PRECIOUS_METALS_HS;

export const UAE_REPORTER_CODE = 784;

export interface ComtradeRecord {
  reporterCode: number;
  reporterDesc: string;
  partnerCode: number;
  partnerDesc: string;
  cmdCode: string;
  cmdDesc: string;
  flowCode: string;
  flowDesc: string;
  period: string;
  primaryValue: number;
  netWgt: number | null;
  qty: number | null;
  qtyUnitAbbr: string | null;
}

export interface ComtradeQueryResult {
  ok: boolean;
  count: number;
  data: ComtradeRecord[];
  error?: string;
}

interface QueryParams {
  reporterCode: number | string;
  cmdCode: string;
  flowCode: string;
  period: string;
  partnerCode?: number | string;
}

async function queryComtrade(params: QueryParams): Promise<ComtradeQueryResult> {
  const result = await fetchJson<ComtradeQueryResult>("/api/comtrade-query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    label: "Comtrade query failed",
    timeoutMs: 25_000,
  });
  if (!result.ok) {
    return { ok: false, count: 0, data: [], error: result.error ?? "Request failed" };
  }
  return result.data ?? { ok: false, count: 0, data: [], error: "No data returned" };
}

/** Fetches gold (HS 7108) trade data for a reporter country and period. */
export async function getGoldTradeData(
  reporterCode: number | string,
  period: string,
  flowCode: string,
): Promise<ComtradeQueryResult> {
  return queryComtrade({ reporterCode, cmdCode: "7108", flowCode, period });
}

/** Fetches all 5 precious metals HS codes for a reporter country (imports only). */
export async function getPreciousMetalsTradeData(
  reporterCode: number | string,
  period: string,
): Promise<Record<HsCode, ComtradeQueryResult>> {
  const codes = Object.keys(PRECIOUS_METALS_HS) as HsCode[];
  const results = await Promise.all(
    codes.map((c) => queryComtrade({ reporterCode, cmdCode: c, flowCode: "M", period })),
  );
  return Object.fromEntries(
    codes.map((c, i) => [c, results[i] ?? { ok: false, count: 0, data: [], error: "No result" }]),
  ) as Record<HsCode, ComtradeQueryResult>;
}

/**
 * Fetches bilateral gold trade flows for mirror-trade discrepancy analysis.
 * Returns UAE's imports from the partner AND the partner's exports to UAE.
 */
export async function getTBMLRiskIndicators(
  reporterCode: number | string,
  partnerCode: number | string,
  period: string,
): Promise<{ uaeImports: ComtradeQueryResult; partnerExports: ComtradeQueryResult }> {
  const [uaeImports, partnerExports] = await Promise.all([
    queryComtrade({ reporterCode, cmdCode: "7108", flowCode: "M", period, partnerCode }),
    queryComtrade({ reporterCode: partnerCode, cmdCode: "7108", flowCode: "X", period, partnerCode: reporterCode }),
  ]);
  return { uaeImports, partnerExports };
}
