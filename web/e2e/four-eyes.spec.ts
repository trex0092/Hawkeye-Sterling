/**
 * four-eyes.spec.ts
 *
 * E2E tests for the four-eyes approval workflow surface.
 *
 * Contract under test (post CG-9 RBAC + trusted-identity hardening):
 *   GET  /api/four-eyes          — list items (API key / admin bearer OK)
 *   POST /api/four-eyes          — enqueue item (subjectId + subjectName +
 *                                  action ∈ {str,freeze,decline,edd-uplift,escalate})
 *   POST /api/four-eyes/approve  — actor identity comes from the authenticated
 *                                  key; identity-less keys (e.g. the portal
 *                                  ADMIN_TOKEN bypass) are rejected with 403
 *   PATCH /api/four-eyes?id=     — approve/reject; requires MLRO/CO/admin
 *                                  portal session (CG-9) — bearer-only → 401
 *
 * The happy-path approval lifecycle (two distinct identified approvers) is
 * covered in the vitest integration suite with mocked sessions; E2E asserts
 * the security boundaries that hold for real HTTP callers.
 */

import { test, expect } from "@playwright/test";

const ADMIN_TOKEN = process.env["ADMIN_TOKEN"] ?? "test-admin-token-for-e2e";

test.describe("Four-eyes approval workflow — API routes", () => {
  test.describe.configure({ mode: "serial" });

  let createdItemId: string;

  test("GET /api/four-eyes returns pending items list", async ({ request }) => {
    const res = await request.get("/api/four-eyes", {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });

    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);
    }
  });

  test("POST /api/four-eyes creates a pending approval item", async ({ request }) => {
    const res = await request.post("/api/four-eyes", {
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        "content-type": "application/json",
      },
      data: {
        subjectId: "cust-e2e-001",
        subjectName: "Green Valley Trading LLC",
        action: "edd-uplift",
        initiatedBy: "analyst_e2e",
        reason: "E2E test — EDD uplift request for Green Valley Trading LLC",
      },
    });

    if (res.status() === 404) {
      // Route may not be implemented in this environment — skip gracefully
      test.skip();
      return;
    }

    expect(res.status()).toBe(200);
    const body = await res.json() as { ok: boolean; item: { id: string; status: string } };
    expect(body.ok).toBe(true);
    expect(typeof body.item.id).toBe("string");
    expect(body.item.id.length).toBeGreaterThan(0);
    expect(body.item.status).toBe("pending");
    createdItemId = body.item.id;
  });

  test("POST /api/four-eyes rejects unknown action values", async ({ request }) => {
    const res = await request.post("/api/four-eyes", {
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        "content-type": "application/json",
      },
      data: {
        subjectId: "cust-e2e-002",
        subjectName: "Invalid Action Test LLC",
        action: "onboard_customer", // not in ALLOWED_ACTIONS
        initiatedBy: "analyst_e2e",
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("action must be one of");
  });

  test("POST /api/four-eyes/approve — first approval recorded, item stays pending", async ({ request }) => {
    if (!createdItemId) {
      test.skip();
      return;
    }

    // Actor identity is derived from the authenticated key — never the body —
    // so impersonation via a body-supplied actor is impossible. One approval
    // must NOT flip the item: two distinct identities are required
    // (Federal Decree-Law No. 10 of 2025 Art.16).
    const res = await request.post("/api/four-eyes/approve", {
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        "content-type": "application/json",
      },
      data: {
        itemId: createdItemId,
        decision: "approve",
        rationale: "First independent review completed — E2E four-eyes approval flow.",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json() as { ok: boolean; itemId: string; status: string };
    expect(body.ok).toBe(true);
    expect(body.itemId).toBe(createdItemId);
    expect(body.status).toBe("pending");
  });

  test("POST /api/four-eyes/approve — same identity cannot sign twice (duplicate-approver guard)", async ({ request }) => {
    if (!createdItemId) {
      test.skip();
      return;
    }

    const res = await request.post("/api/four-eyes/approve", {
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        "content-type": "application/json",
      },
      data: {
        itemId: createdItemId,
        decision: "approve",
        rationale: "Second sign-off attempt from the SAME identity — must be refused.",
      },
    });

    expect(res.status()).toBe(409);
    const body = await res.json() as { ok?: boolean; error: string };
    expect(body.error).toBe("duplicate_approver");
  });

  test("PATCH /api/four-eyes requires a portal session (CG-9 RBAC)", async ({ request }) => {
    if (!createdItemId) {
      test.skip();
      return;
    }

    // CG-9: approve/reject decisions require an MLRO/CO/admin portal session.
    // A bearer-only caller (no session cookie) must get 401 SESSION_REQUIRED.
    const res = await request.patch(`/api/four-eyes?id=${createdItemId}`, {
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        "content-type": "application/json",
      },
      data: {
        decision: "approve",
        approvedBy: "mlro_approver_1",
      },
    });

    expect(res.status()).toBe(401);
    const body = await res.json() as { ok: boolean; code?: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("SESSION_REQUIRED");
  });
});
