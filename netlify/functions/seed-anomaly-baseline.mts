// Netlify one-shot function — seeds the transaction anomaly baseline.
//
// Loads data/anomaly-baseline.json (500 synthetic transactions representing
// normal UAE DPMS business patterns) into the streaming anomaly gate via
// /api/transaction-anomaly so that the first real transaction arrives into
// a warm model rather than an untrained state.
//
// Trigger manually via Netlify dashboard (Functions → seed-anomaly-baseline →
// Invoke) or via cron after a cold deploy. Does NOT run on every deploy.
//
// The baseline is NOT stored in Blobs — each warm Lambda maintains its own
// gate state in memory. This function should be invoked once per new Lambda
// instance when needed.

import type { Config } from "@netlify/functions";

interface TransactionPayload {
  amountUsd: number;
  amountAed?: number;
  timestampUtc?: string;
  paymentMethod?: string;
  assetClass?: string;
  counterpartyFirstSeen?: boolean;
  countryRiskScore?: number;
  jurisdiction?: string;
  customerBaseline?: {
    meanAmount?: number;
    stdAmount?: number;
    txnPer7d?: number;
  };
}

export default async (_req: Request): Promise<Response> => {
  const baseUrl =
    process.env["URL"] ??
    process.env["DEPLOY_PRIME_URL"] ??
    "https://hawkeye-sterling.netlify.app";

  const startedAt = new Date().toISOString();
  console.info("[seed-anomaly-baseline] starting at", startedAt);

  // Load baseline file (bundled at build time from data/anomaly-baseline.json).
  // Netlify bundles static files referenced via import — if the file isn't
  // accessible at runtime, we fall back to a minimal inline set.
  let baseline: TransactionPayload[] = [];
  try {
    // Dynamic import of the JSON file relative to the function root.
    const url = new URL("../../data/anomaly-baseline.json", import.meta.url);
    const { default: data } = (await import(url.pathname, { assert: { type: "json" } }).catch(
      () => import("../../data/anomaly-baseline.json", { assert: { type: "json" } }),
    )) as { default: TransactionPayload[] };
    baseline = Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("[seed-anomaly-baseline] could not load baseline JSON — using empty set:", err instanceof Error ? err.message : err);
  }

  if (baseline.length === 0) {
    return new Response(
      JSON.stringify({ ok: false, reason: "baseline data not available", startedAt }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  console.info(`[seed-anomaly-baseline] seeding ${baseline.length} baseline transactions`);

  // Feed baseline into /api/transaction-anomaly using the shared "baseline"
  // sessionId. Batch in groups of 10 to avoid overwhelming the function.
  const BATCH_SIZE = 10;
  let successCount = 0;
  let errorCount = 0;

  const sessionId = "baseline";

  for (let i = 0; i < baseline.length; i += BATCH_SIZE) {
    const batch = baseline.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (tx) => {
        try {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 8_000);
          try {
            const res = await fetch(`${baseUrl}/api/transaction-anomaly`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                // Use internal cron token if set, otherwise skip auth (internal call)
                ...(process.env["SANCTIONS_CRON_TOKEN"]
                  ? { authorization: `Bearer ${process.env["SANCTIONS_CRON_TOKEN"]}` }
                  : {}),
              },
              body: JSON.stringify({ transaction: tx, sessionId }),
              signal: ctl.signal,
            });
            if (res.ok) successCount++;
            else errorCount++;
          } finally {
            clearTimeout(timer);
          }
        } catch {
          errorCount++;
        }
      }),
    );
  }

  const completedAt = new Date().toISOString();
  console.info(
    `[seed-anomaly-baseline] complete: seeded=${successCount} errors=${errorCount} at=${completedAt}`,
  );

  return new Response(
    JSON.stringify({
      ok: errorCount === 0,
      seeded: successCount,
      errors: errorCount,
      totalBaseline: baseline.length,
      sessionId,
      startedAt,
      completedAt,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

// No schedule — invoke manually. Declaring config with no schedule makes it
// a background function invokable from the Netlify dashboard.
export const config: Config = {
  // background: true would make it fire-and-forget but we want a response
};
