// Hawkeye Sterling — commercial tier definitions.
//
// Every API key is bound to exactly one tier. Quotas, rate-limits and
// feature-gates are derived from this table so there is a single source
// of truth for the commercial surface — pricing pages, status dashboards,
// docs and the rate-limit middleware all read from here.

export type TierId = "free" | "starter" | "pro" | "enterprise";

export interface TierDefinition {
  id: TierId;
  label: string;
  priceUsdMonthly: number | null;
  /** Screening calls allowed per calendar month. null = unlimited. */
  monthlyQuota: number | null;
  /** Requests per minute across all endpoints. */
  rateLimitPerMinute: number;
  /** Requests per second — short-burst cap. */
  rateLimitPerSecond: number;
  /** Ongoing-monitoring subjects the tier may enrol. */
  monitoringSubjects: number;
  /** SLA commitment (annual uptime percentage). */
  uptimeSla: number;
  features: string[];
}

export const TIERS: Record<TierId, TierDefinition> = {
  free: {
    id: "free",
    label: "Free",
    priceUsdMonthly: 0,
    monthlyQuota: 1_000,
    rateLimitPerMinute: 60,
    rateLimitPerSecond: 5,
    monitoringSubjects: 10,
    uptimeSla: 99.9,
    features: [
      "Quick screen (/api/quick-screen)",
      "Adverse-media dossier",
      "Super-brain analysis",
      "Sandbox environment",
      "Community support",
    ],
  },
  starter: {
    id: "starter",
    label: "Starter",
    priceUsdMonthly: 99,
    monthlyQuota: 25_000,
    rateLimitPerMinute: 300,
    rateLimitPerSecond: 20,
    monitoringSubjects: 500,
    uptimeSla: 99.95,
    features: [
      "Everything in Free",
      "Batch screening",
      "Ongoing monitoring",
      "Webhook delivery",
      "Email support",
    ],
  },
  pro: {
    id: "pro",
    label: "Pro",
    priceUsdMonthly: 499,
    monthlyQuota: 250_000,
    rateLimitPerMinute: 1_500,
    rateLimitPerSecond: 100,
    monitoringSubjects: 10_000,
    uptimeSla: 99.99,
    features: [
      "Everything in Starter",
      "Super-brain fusion (PEP + ESG + typologies)",
      "Transaction monitoring",
      "STR/SAR auto-draft",
      "Priority support (4h response)",
    ],
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    priceUsdMonthly: null,
    monthlyQuota: null,
    rateLimitPerMinute: 10_000,
    rateLimitPerSecond: 500,
    monitoringSubjects: 250_000,
    uptimeSla: 99.99,
    features: [
      "Everything in Pro",
      "Custom watchlists + air-gap deployment",
      "Dedicated MLRO co-pilot",
      "SAML/SCIM + on-prem",
      "Annual contract + signed SLA",
      "ISAE 3000 Type II attestation",
    ],
  },
};

export function tierFor(id: string | null | undefined): TierDefinition {
  if (!id) return TIERS.free;
  return TIERS[id as TierId] ?? TIERS.free;
}
