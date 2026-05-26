/**
 * mlro-flow.spec.ts
 *
 * E2E tests for the MLRO advisor API routes.
 * Uses Playwright request context (no browser) — tests route handlers
 * directly over HTTP against the running Next.js dev server.
 *
 * Key routes covered:
 *   POST /api/mlro-advisor/chain-run  — full 3-step advisory chain
 *   POST /api/smart-disambiguate      — hit disambiguation engine
 *   POST /api/ai-decision             — compliance decision engine
 *
 * All tests use the ADMIN_TOKEN for auth and send deterministic payloads
 * that exercise the rule-based (degraded) path so no ANTHROPIC_API_KEY is
 * required in the test environment.
 */

import { test, expect } from "@playwright/test";

const ADMIN_TOKEN = process.env["ADMIN_TOKEN"] ?? "test-admin-token-for-e2e";

test.describe("MLRO advisor flow — API routes", () => {
  test.describe.configure({ mode: "serial" });

  test("POST /api/mlro-advisor/chain-run returns ok:true in degraded mode", async ({ request }) => {
    const res = await request.post("/api/mlro-advisor/chain-run", {
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        "content-type": "application/json",
      },
      data: {
        subject: "Ali Hassan Al-Rashid",
        jurisdiction: "UAE",
        riskScore: 72,
        transactionPattern: "Multiple cash deposits below reporting threshold",
      },
    });

    // Without ANTHROPIC_API_KEY the route returns the deterministic template.
    // It should always return 200 with ok:true regardless of LLM availability.
    expect(res.status()).toBe(200);
    const body = await res.json() as {
      ok: boolean;
      subjectBrief: string;
      typologyMatch: string;
      strRecommendation: string;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.subjectBrief).toBe("string");
    expect(body.subjectBrief.length).toBeGreaterThan(10);
    expect(typeof body.typologyMatch).toBe("string");
    expect(typeof body.strRecommendation).toBe("string");
  });

  test("POST /api/smart-disambiguate returns disambiguation result", async ({ request }) => {
    const res = await request.post("/api/smart-disambiguate", {
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        "content-type": "application/json",
      },
      data: {
        client: {
          name: "Mohamed Ahmed",
          nationality: "UAE",
          dob: "1985-03-15",
          gender: "male",
        },
        hits: [
          {
            hitId: "HIT-001",
            hitName: "Mohamed Ahmed",
            hitCategory: "sanctions",
            hitCountry: "SY",
            hitDob: "1962-07-22",
            matchScore: 85,
          },
          {
            hitId: "HIT-002",
            hitName: "Mohamed S Ahmed",
            hitCategory: "pep",
            hitCountry: "EG",
            matchScore: 70,
          },
        ],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json() as {
      ok: boolean;
      hits: Array<{ hitId: string; verdict: string }>;
      overallAssessment: string;
    };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.hits)).toBe(true);
    expect(body.hits.length).toBe(2);
    const firstHit = body.hits[0];
    expect(firstHit).toBeDefined();
    expect(firstHit?.hitId).toBe("HIT-001");
    expect(["confirmed_false_positive", "likely_false_positive", "possible_match", "likely_true_match"]).toContain(
      firstHit?.verdict,
    );
  });

  test("POST /api/smart-disambiguate rejects empty hits array", async ({ request }) => {
    const res = await request.post("/api/smart-disambiguate", {
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        "content-type": "application/json",
      },
      data: {
        client: { name: "Test Subject" },
        hits: [],
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  test("POST /api/ai-decision returns compliance decision", async ({ request }) => {
    const res = await request.post("/api/ai-decision", {
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        "content-type": "application/json",
      },
      data: {
        subjectId: "subj-e2e-001",
        name: "Green Valley Trading LLC",
        country: "AE",
        entityType: "corporate",
        riskScore: 45,
        listCoverage: ["ofac_sdn", "un_consolidated", "eu_fsf"],
        sanctionsHits: [],
        adverseMedia: "No adverse media found.",
        pepTier: null,
        exposureAED: "50000",
      },
    });

    // May return 503 if sanctions lists are not loaded in test env.
    // In that case verify the correct error shape is returned.
    if (res.status() === 503) {
      const body = await res.json() as { ok: boolean; decision: string };
      expect(body.ok).toBe(false);
      expect(body.decision).toBe("BLOCKED_DATA_INTEGRITY");
      return;
    }

    expect(res.status()).toBe(200);
    const body = await res.json() as {
      ok: boolean;
      decision: string;
      confidence: number;
      rationale: string;
    };
    expect(body.ok).toBe(true);
    expect(["approve", "edd", "escalate", "str"]).toContain(body.decision);
    expect(typeof body.confidence).toBe("number");
    expect(body.confidence).toBeGreaterThan(0);
    expect(body.confidence).toBeLessThanOrEqual(100);
  });

  test("Unauthenticated request to /api/mlro-advisor/chain-run returns 401", async ({ request }) => {
    const res = await request.post("/api/mlro-advisor/chain-run", {
      headers: { "content-type": "application/json" },
      data: { subject: "Test", jurisdiction: "UAE", riskScore: 50 },
    });
    expect(res.status()).toBe(401);
  });
});
