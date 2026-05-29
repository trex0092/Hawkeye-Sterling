// Risk Appetite Matrix configuration store.
// Allows per-tenant customisation of auto-approve / review / escalate thresholds
// and customer-segment multipliers used when computing effective risk scores.

import { getJson, setJson } from "@/lib/server/store";

export interface RiskAppetiteConfig {
  tenantId: string;
  updatedAt: string;
  updatedBy: string;
  thresholds: {
    autoApprove: number;      // score 0-N: auto-clear (default 15)
    reviewRequired: number;   // score N-M: MLRO review (default 50)
    autoEscalate: number;     // score M+: auto-escalate to MLRO (default 75)
  };
  customerSegments: {
    retail:    { multiplier: number }; // default 1.0
    corporate: { multiplier: number }; // default 1.2
    pep:       { multiplier: number }; // default 2.0
    highRisk:  { multiplier: number }; // default 1.5
  };
  adverseMediaWeight: number; // 0-1, default 0.2
  sanctionsWeight: number;    // 0-1, default 0.5
  pepWeight: number;          // 0-1, default 0.3
}

export const DEFAULT_RISK_APPETITE: Omit<
  RiskAppetiteConfig,
  "tenantId" | "updatedAt" | "updatedBy"
> = {
  thresholds: {
    autoApprove: 15,
    reviewRequired: 50,
    autoEscalate: 75,
  },
  customerSegments: {
    retail:    { multiplier: 1.0 },
    corporate: { multiplier: 1.2 },
    pep:       { multiplier: 2.0 },
    highRisk:  { multiplier: 1.5 },
  },
  adverseMediaWeight: 0.2,
  sanctionsWeight: 0.5,
  pepWeight: 0.3,
};

function riskAppetiteKey(tenantId: string): string {
  return `risk-appetite:${tenantId}`;
}

export async function getRiskAppetite(tenantId: string): Promise<RiskAppetiteConfig> {
  const stored = await getJson<RiskAppetiteConfig>(riskAppetiteKey(tenantId));
  if (stored) return stored;
  // Return defaults wrapped with tenant metadata so callers always get a
  // fully-formed RiskAppetiteConfig without having to handle null.
  return {
    ...DEFAULT_RISK_APPETITE,
    tenantId,
    updatedAt: new Date(0).toISOString(),
    updatedBy: "system:defaults",
  };
}

export async function saveRiskAppetite(config: RiskAppetiteConfig): Promise<void> {
  await setJson(riskAppetiteKey(config.tenantId), config);
}
