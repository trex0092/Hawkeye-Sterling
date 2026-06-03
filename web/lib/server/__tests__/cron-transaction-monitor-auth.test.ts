import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/cron/transaction-monitor/route";

// Regression test for the scheduler/route token-contract mismatch.
//
// netlify/functions/transaction-monitor.mts authenticates with
//   Authorization: Bearer ${CRON_SECRET ?? ONGOING_RUN_TOKEN}
// so the route MUST accept the same token set in the same fallback order.
// Previously the route only accepted CRON_SECRET and 401'd every scheduled run
// on deployments that set ONGOING_RUN_TOKEN but not CRON_SECRET.

function post(token?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers["authorization"] = `Bearer ${token}`;
  return POST(
    new Request("https://example.test/api/cron/transaction-monitor", {
      method: "POST",
      headers,
    }),
  ) as unknown as Promise<Response>;
}

describe("cron/transaction-monitor auth", () => {
  const prev = {
    CRON_SECRET: process.env["CRON_SECRET"],
    ONGOING_RUN_TOKEN: process.env["ONGOING_RUN_TOKEN"],
    NODE_ENV: process.env["NODE_ENV"],
  };

  beforeEach(() => {
    delete process.env["CRON_SECRET"];
    delete process.env["ONGOING_RUN_TOKEN"];
    process.env["NODE_ENV"] = "test"; // bypass the production-only scheduled-header gate
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("401s when no token is configured (fail-closed)", async () => {
    const res = await post("anything");
    expect(res.status).toBe(401);
  });

  it("401s on a wrong token", async () => {
    process.env["CRON_SECRET"] = "real-cron-secret";
    const res = await post("wrong-token");
    expect(res.status).toBe(401);
  });

  it("401s when no Authorization header is sent", async () => {
    process.env["CRON_SECRET"] = "real-cron-secret";
    const res = await post(undefined);
    expect(res.status).toBe(401);
  });

  it("accepts the configured CRON_SECRET", async () => {
    process.env["CRON_SECRET"] = "real-cron-secret";
    const res = await post("real-cron-secret");
    expect(res.status).not.toBe(401);
  });

  it("accepts ONGOING_RUN_TOKEN as the scheduler's documented fallback", async () => {
    process.env["ONGOING_RUN_TOKEN"] = "real-ongoing-token";
    const res = await post("real-ongoing-token");
    expect(res.status).not.toBe(401);
  });

  it("accepts CRON_SECRET even when ONGOING_RUN_TOKEN is also set", async () => {
    process.env["CRON_SECRET"] = "real-cron-secret";
    process.env["ONGOING_RUN_TOKEN"] = "real-ongoing-token";
    const res = await post("real-cron-secret");
    expect(res.status).not.toBe(401);
  });
});
