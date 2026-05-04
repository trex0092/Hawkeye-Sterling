import { getStore as getNetlifyStore } from "@netlify/blobs";

const BILLING_STORE = "hawkeye-billing";

// `@netlify/plugin-nextjs` does not auto-inject Blobs context into Next.js API
// routes in this monorepo layout — `getNetlifyStore(BILLING_STORE)` throws
// `MissingBlobsEnvironmentError` and bubbles a 500 unless we pass siteID +
// token explicitly. Mirror the pattern from `web/lib/server/store.ts`.
function buildBillingStoreOptions(): Parameters<typeof getNetlifyStore>[0] {
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  if (siteID && token) {
    return { name: BILLING_STORE, siteID, token, consistency: "strong" };
  }
  return { name: BILLING_STORE };
}

export function getBillingStore(): ReturnType<typeof getNetlifyStore> {
  return getNetlifyStore(buildBillingStoreOptions());
}

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
    const store = getBillingStore();
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

export { BILLING_STORE };
