/**
 * api-unit.spec.ts
 *
 * Integration tests for Next.js route handlers called via HTTP.
 * These tests focus on specific handler behaviours rather than browser UX.
 * They exercise the POST /api/auth/login route with fine-grained assertions.
 *
 * Note: Because the tsconfig uses `moduleResolution: bundler` (a Next.js
 * internal resolver), the route handlers cannot be imported directly into
 * a plain Node.js test runner without the Next.js compilation pipeline.
 * We call them over HTTP instead, which gives equivalent coverage while
 * keeping the test infrastructure simple.
 */

import { test, expect } from "@playwright/test";

test.describe("Auth login route handler — unit-level HTTP tests", () => {
  const ENDPOINT = "/api/auth/login";

  test("bad JSON body returns 400 with ok:false and error message", async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      headers: { "content-type": "application/json" },
      data: "not-valid-{json",
    });

    expect(response.status()).toBe(400);
    const body = await response.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  test("missing username field returns 400", async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      data: { password: "somepassword" },
    });

    expect(response.status()).toBe(400);
    const body = await response.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/required/i);
  });

  test("missing password field returns 400", async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      data: { username: "someuser" },
    });

    expect(response.status()).toBe(400);
    const body = await response.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/required/i);
  });

  test("empty username string returns 400", async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      data: { username: "   ", password: "password123" },
    });

    expect(response.status()).toBe(400);
    const body = await response.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
  });

  test("empty password string returns 400", async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      data: { username: "validuser", password: "" },
    });

    expect(response.status()).toBe(400);
    const body = await response.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
  });

  test("both fields empty returns 400", async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      data: { username: "", password: "" },
    });

    expect(response.status()).toBe(400);
    const body = await response.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
  });

  test("unknown user returns 401 with invalid credentials message", async ({ request }) => {
    // The route adds a ~400ms uniform delay to prevent user enumeration via timing
    const response = await request.post(ENDPOINT, {
      data: {
        username: "definitely_not_a_real_user_xyz_12345",
        password: "not-a-real-password",
      },
      timeout: 15_000,
    });

    expect(response.status()).toBe(401);
    const body = await response.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Invalid username or password/i);
  });

  test("response Content-Type is application/json for all error cases", async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      data: { username: "testuser", password: "wrongpass" },
      timeout: 15_000,
    });

    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toContain("application/json");
  });

  test("oversized username (>256 chars) returns 401", async ({ request }) => {
    const response = await request.post(ENDPOINT, {
      data: {
        username: "a".repeat(257),
        password: "not-a-real-password",
      },
    });

    // Route treats oversized input as "Invalid credentials" (DoS protection)
    expect(response.status()).toBe(401);
    const body = await response.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
  });
});
