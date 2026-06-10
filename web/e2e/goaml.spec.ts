/**
 * goaml.spec.ts
 *
 * E2E tests for the goAML XML generation route's security boundaries.
 *
 * Contract under test (post CG-9 RBAC, 2026-05-27):
 *   POST /api/goaml requires BOTH a valid API key (enforce) AND an
 *   MLRO/CO/admin portal session (requireRole). External bearer-only
 *   callers — even with a valid admin bearer — receive 401 SESSION_REQUIRED.
 *   Anonymous callers receive 401 from the fail-closed enforce() gate.
 *
 * The XML envelope shape, report-code/narrative validation (400s), and the
 * tipping-off egress gate (422) sit behind the session gate and are covered
 * in the vitest integration suite (src/__integration__) with mocked sessions.
 */

import { test, expect } from "@playwright/test";

const ADMIN_TOKEN = process.env["ADMIN_TOKEN"] ?? "test-admin-token-for-e2e";

const VALID_STR_PAYLOAD = {
  reportCode: "STR",
  subject: {
    name: "Test Trading LLC",
    entityType: "organisation",
    jurisdiction: "AE",
    caseId: "case-e2e-001",
  },
  narrative:
    "Subject presents indicators of layering: multiple cash deposits below AED 55,000 " +
    "threshold across seven business days, aggregate AED 280,000. No legitimate commercial " +
    "rationale provided. Suspicion arising from structuring pattern consistent with FATF typology T5.",
  amountAed: 280000,
  counterparty: "First National Bank UAE",
};

test.describe("goAML XML generation — security boundaries", () => {
  test("POST /api/goaml rejects anonymous callers (fail-closed enforce)", async ({ request }) => {
    const res = await request.post("/api/goaml", {
      headers: { "content-type": "application/json" },
      data: VALID_STR_PAYLOAD,
    });

    expect(res.status()).toBe(401);
  });

  test("POST /api/goaml requires a portal session (CG-9 RBAC) — bearer-only gets 401 SESSION_REQUIRED", async ({ request }) => {
    const res = await request.post("/api/goaml", {
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        "content-type": "application/json",
      },
      data: VALID_STR_PAYLOAD,
    });

    // Regulatory-filing routes never accept API-key-only callers: generating
    // an STR/SAR filing requires an authenticated MLRO/CO/admin portal role
    // (UAE Federal Decree-Law No. 10 of 2025 Art.15/Art.16; CG-9).
    expect(res.status()).toBe(401);
    const body = await res.json() as { ok: boolean; code?: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("SESSION_REQUIRED");
  });

  test("GET /api/goaml/entities is reachable with a bearer (non-filing read)", async ({ request }) => {
    const res = await request.get("/api/goaml/entities", {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    // Reading the configured reporting-entity list is not a filing action;
    // it is allowed for authenticated API callers. 404 tolerated where the
    // route is absent in a stripped environment.
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json() as { ok: boolean; entities?: unknown[] };
      expect(body.ok).toBe(true);
    }
  });
});
