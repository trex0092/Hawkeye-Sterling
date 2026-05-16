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
});
