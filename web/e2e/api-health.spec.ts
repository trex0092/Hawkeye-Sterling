import { test, expect } from "@playwright/test";

// API-level health checks — these hit the Next.js route handlers via HTTP.
// They verify the server doesn't crash and returns sensible status codes.

test.describe("API health checks", () => {
  test("POST /api/auth/login with bad JSON returns 400", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      headers: { "content-type": "application/json" },
      data: "{ this is not valid json }",
    });
    expect(response.status()).toBe(400);
    const body = await response.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
  });

  test("POST /api/auth/login with missing fields returns 400", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: { username: "", password: "" },
    });
    expect(response.status()).toBe(400);
    const body = await response.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
  });

  test("POST /api/auth/login with missing password field returns 400", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: { username: "someuser" },
    });
    expect(response.status()).toBe(400);
    const body = await response.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
  });

  test("OPTIONS /api/crypto-risk returns 204 with CORS headers", async ({ request }) => {
    const response = await request.fetch("/api/crypto-risk", {
      method: "OPTIONS",
      headers: {
        Origin: "https://hawkeye-sterling.netlify.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    // The route exports an OPTIONS handler that returns 204 No Content
    expect(response.status()).toBe(204);
    const corsHeader = response.headers()["access-control-allow-methods"] ?? "";
    expect(corsHeader.toLowerCase()).toContain("post");
  });

  test("OPTIONS /api/lei-lookup returns 204", async ({ request }) => {
    const response = await request.fetch("/api/lei-lookup", {
      method: "OPTIONS",
      headers: {
        Origin: "https://hawkeye-sterling.netlify.app",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(response.status()).toBe(204);
  });

  test("GET /api/well-known/jwks.json returns a valid JWKS response", async ({ request }) => {
    const response = await request.get("/api/well-known/jwks.json");
    // Always returns 200 — empty keys[] when REPORT_ED25519_PRIVATE_KEY not set
    expect(response.status()).toBe(200);
    const body = await response.json() as { keys: unknown[] };
    // Must have a `keys` array (RFC 7517 JWKS format)
    expect(Array.isArray(body.keys)).toBe(true);
    // Content-Type should be JWKS
    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/json/);
  });

  test("POST /api/auth/login with unknown user returns 401", async ({ request }) => {
    const response = await request.post("/api/auth/login", {
      data: { username: "nonexistent_user_xyz", password: "not-a-real-password" },
    });
    expect(response.status()).toBe(401);
    const body = await response.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Invalid username or password/i);
  });

  test("POST /api/auth/logout returns 200 and clears the session cookie", async ({ request }) => {
    const response = await request.post("/api/auth/logout");
    expect(response.status()).toBe(200);
    const body = await response.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    // The Set-Cookie header should expire the hs_session cookie
    const setCookie = response.headers()["set-cookie"] ?? "";
    expect(setCookie).toContain("hs_session=");
    expect(setCookie).toMatch(/max-age=0/i);
  });

  test("POST /api/iban-risk with missing iban returns 400", async ({ request }) => {
    const response = await request.post("/api/iban-risk", {
      data: {},
    });
    expect(response.status()).toBe(400);
    const body = await response.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
  });

  test("POST /api/iban-risk with UK IBAN returns 200 with low risk", async ({ request }) => {
    const response = await request.post("/api/iban-risk", {
      data: { iban: "GB29NWBK60161331926819" },
    });
    expect(response.status()).toBe(200);
    const body = await response.json() as { ok: boolean; countryCode: string; riskLevel: string };
    expect(body.ok).toBe(true);
    expect(body.countryCode).toBe("GB");
    expect(body.riskLevel).toBe("low");
  });

  test("POST /api/country-risk with missing country returns 400", async ({ request }) => {
    const response = await request.post("/api/country-risk", {
      data: {},
    });
    expect(response.status()).toBe(400);
    const body = await response.json() as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
  });

  test("POST /api/country-risk for UAE returns 200 with static data", async ({ request }) => {
    const response = await request.post("/api/country-risk", {
      data: { country: "UAE" },
    });
    expect(response.status()).toBe(200);
    const body = await response.json() as { ok: boolean; country: string; fatfStatus: string };
    expect(body.ok).toBe(true);
    // Response should reference UAE or United Arab Emirates
    expect(body.country).toMatch(/emirates|UAE/i);
    expect(body.fatfStatus).toBe("member");
  });
});
