import { getStore } from "@netlify/blobs";

export const BILLING_STORE = "hawkeye-billing";

export type BillingMetric =
  | "screensRun"
  | "agentScreensRun"
  | "advisorCallsRun"
  | "dispositionsLogged"
  | "str_drafts"
  | "agent_extractions"
  | "soc2_exports";

export interface UsageBucket {
  tenant: string;
  monthIso: string;
  counters: Partial<Record<BillingMetric, number>>;
  lastUpdated: string;
}

export function monthKey(at = new Date()): string {
  return at.toISOString().slice(0, 7);
}

export function bucketKey(tenant: string, month: string): string {
  return `usage/${tenant}/${month}.json`;
}

export async function incrementUsage(
  tenant: string,
  metric: BillingMetric,
  by = 1,
): Promise<void> {
  try {
    const store = getStore(BILLING_STORE);
    const month = monthKey();
    const key = bucketKey(tenant, month);
    let bucket: UsageBucket;
    try {
      const raw = await store.get(key, { type: "text" });
      if (raw) bucket = JSON.parse(raw) as UsageBucket;
      else bucket = { tenant, monthIso: month, counters: {}, lastUpdated: new Date().toISOString() };
    } catch {
      bucket = { tenant, monthIso: month, counters: {}, lastUpdated: new Date().toISOString() };
    }
    bucket.counters[metric] = (bucket.counters[metric] ?? 0) + by;
    bucket.lastUpdated = new Date().toISOString();
    await store.set(key, JSON.stringify(bucket));
  } catch {
    // best-effort — billing IO must not break the calling route.
  }
}
