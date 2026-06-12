// POST /api/admin/purge-bra
//
// One-shot decommission endpoint for the retired Business Risk (BRA)
// module (operator-directed removal, 2026-06-12). Companion to the code
// removal commit — handles the two artifacts that live outside the repo:
//
//   1. Blob store: deletes every key under the `bra/` prefix in the app
//      store. The live check before removal showed 0 records; the sweep
//      is belt-and-braces so the decommission is provably complete.
//   2. Asana: deletes the orphaned module project
//      "2.27 · 📊 Business Risk (BRA)" (GID below) via the Asana API with
//      the server's ASANA_TOKEN — the operator-facing MCP toolset has no
//      project-delete capability. A 404 from Asana means it is already
//      gone and counts as success (idempotent).
//
// The purge is recorded in the append-only audit chain so the deletion
// itself remains evidenced (FDL 10/2025 Art.24). Auth: Bearer ADMIN_TOKEN,
// same fail-closed pattern as /api/admin/trigger-refresh. The endpoint is
// idempotent and may be deleted once the decommission is confirmed.

import { NextResponse } from "next/server";
import { del, listKeys } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 2.27 · 📊 Business Risk (BRA) — created by the 2026-06-10 workspace
// bootstrap; its attestation + digest tasks were already deleted via MCP.
const BRA_ASANA_PROJECT_GID = "1215582428708762";

async function timingSafeTokenCheck(got: string, expected: string): Promise<boolean> {
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const COMPARE_KEY = Buffer.from("hawkeye-token-compare-v1", "utf8");
  const ha = createHmac("sha256", COMPARE_KEY).update(expected).digest();
  const hb = createHmac("sha256", COMPARE_KEY).update(got).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(req: Request): Promise<NextResponse> {
  // Auth — fail closed.
  const expected = process.env["ADMIN_TOKEN"];
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_TOKEN not configured" },
      { status: 503 },
    );
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!got || !(await timingSafeTokenCheck(got, expected))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const triggeredAt = new Date().toISOString();

  // 1. Sweep any remaining BRA blobs.
  const blobKeys = await listKeys("bra/");
  const blobErrors: string[] = [];
  for (const key of blobKeys) {
    try {
      await del(key);
    } catch (err) {
      blobErrors.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Delete the orphaned Asana project. 404 = already gone (idempotent).
  let asanaStatus: number | null = null;
  let asanaError: string | null = null;
  const asanaToken = process.env["ASANA_TOKEN"];
  if (!asanaToken) {
    asanaError = "ASANA_TOKEN not configured — project must be deleted in the Asana UI";
  } else {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 10_000);
      try {
        const res = await fetch(
          `https://app.asana.com/api/1.0/projects/${BRA_ASANA_PROJECT_GID}`,
          {
            method: "DELETE",
            headers: { authorization: `Bearer ${asanaToken}` },
            signal: ctl.signal,
          },
        );
        asanaStatus = res.status;
        if (!res.ok && res.status !== 404) {
          asanaError = `Asana DELETE returned HTTP ${res.status}`;
        }
      } finally {
        clearTimeout(t);
      }
    } catch (err) {
      asanaError = err instanceof Error ? err.message : String(err);
    }
  }

  const asanaDeleted = asanaStatus === 200 || asanaStatus === 404;
  const ok = blobErrors.length === 0 && asanaDeleted;

  void writeAuditChainEntry(
    {
      event: "module.bra_purged",
      actor: "admin",
      triggeredAt,
      blobKeysDeleted: blobKeys.length,
      blobErrors,
      asanaProjectGid: BRA_ASANA_PROJECT_GID,
      asanaStatus,
      ok,
    },
    process.env["DEFAULT_TENANT"] ?? "default",
  ).catch((err) =>
    console.warn("[purge-bra] audit chain write failed:", err instanceof Error ? err.message : String(err)),
  );

  return NextResponse.json({
    ok,
    triggeredAt,
    blobKeysDeleted: blobKeys.length,
    blobErrors,
    asana: {
      projectGid: BRA_ASANA_PROJECT_GID,
      status: asanaStatus,
      deleted: asanaDeleted,
      ...(asanaError ? { error: asanaError } : {}),
    },
    hint: ok
      ? "BRA decommission complete — blobs swept and Asana project deleted. This endpoint can now be removed."
      : "Partial failure — see blobErrors / asana.error.",
  });
}
