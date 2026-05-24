// GET /api/system/rate-limits
//
// Returns the current rate-limit configuration for all tiers, along with
// per-endpoint cost information. Useful for dashboard / ops visibility.
//
// Response shape:
//   {
//     ok: true,
//     tiers: { [tierId]: { rateLimitPerMinute, rateLimitPerSecond, monthlyQuota } },
//     endpoints: { quickScreen: { cost: 2 }, default: { cost: 1 } },
//     callerTier: string,           // tier of the authenticated caller
//     callerRemainingMinute: number // remaining requests in the current minute window
//   }
//
// Auth: requireAuth: true

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { TIERS } from "@/lib/data/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  // Build a sanitised view of all tier configs (omit features list for brevity).
  const tiers = Object.fromEntries(
    Object.entries(TIERS).map(([id, tier]) => [
      id,
      {
        label: tier.label,
        rateLimitPerMinute: tier.rateLimitPerMinute,
        rateLimitPerSecond: tier.rateLimitPerSecond,
        monthlyQuota: tier.monthlyQuota,
      },
    ]),
  );

  // Per-endpoint cost table (static — reflects enforcement.ts cost overrides).
  const endpoints = {
    quickScreen: { cost: 2, description: "POST /api/quick-screen — costs 2 rate-limit units" },
    default: { cost: 1, description: "All other endpoints — costs 1 rate-limit unit" },
  };

  // Extract caller context from the rate-limit headers set by enforce().
  const callerTier = gate.headers["x-ratelimit-tier"] ?? gate.tier.id;
  const callerRemainingMinuteRaw = gate.headers["x-ratelimit-remaining-minute"];
  const callerRemainingMinute =
    callerRemainingMinuteRaw !== undefined ? parseInt(callerRemainingMinuteRaw, 10) : null;

  const body = {
    ok: true,
    tiers,
    endpoints,
    callerTier,
    callerRemainingMinute,
    windowMs: 60_000,
    maxRequests: gate.tier.rateLimitPerMinute,
  };

  return NextResponse.json(body, {
    status: 200,
    headers: gate.headers,
  });
}
