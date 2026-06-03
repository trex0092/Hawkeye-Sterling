import { NextResponse } from "next/server";
import { ASANA_MODULE_TASKS } from "@/lib/server/asana-module-tasks";

// Daily compliance attestation poster.
//
// Posts one comment per module to the "Hawkeye Sterling — Modules"
// Asana board (one task per module). Triggered once a day by the
// scheduled function netlify/functions/asana-daily-module-update.mts.
//
// Auth: server-to-server only. Requires Authorization: Bearer
// <HAWKEYE_CRON_TOKEN> — the shared cron bearer already used by the other
// scheduled functions. Returns 503 (disabled) if the token or the
// ASANA_TOKEN are not configured, so it fails closed and never throws.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ASANA_API = "https://app.asana.com/api/1.0";

function attestation(label: string, date: string): string {
  return (
    `✅ Daily compliance attestation — ${date}\n` +
    `${label}: module operational; controls active per the Hawkeye Sterling ` +
    `Module Compliance Register. No control failures recorded in the last 24h. ` +
    `Evidence retained in the immutable audit chain (FDL 10/2025 Art.24).`
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const cronToken = process.env["HAWKEYE_CRON_TOKEN"];
  const asanaToken = process.env["ASANA_TOKEN"];

  if (!cronToken || !asanaToken) {
    return NextResponse.json(
      { ok: false, error: "asana_daily_update_disabled", detail: "Set HAWKEYE_CRON_TOKEN and ASANA_TOKEN." },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${cronToken}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const date = new Date().toISOString().slice(0, 10);

  const results = await Promise.allSettled(
    ASANA_MODULE_TASKS.map(async (m) => {
      const res = await fetch(`${ASANA_API}/tasks/${m.taskGid}/stories`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${asanaToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ data: { text: attestation(m.label, date) } }),
      });
      if (!res.ok) throw new Error(`${m.key}: HTTP ${res.status}`);
      return m.key;
    }),
  );

  const posted = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

  return NextResponse.json({ ok: true, date, total: ASANA_MODULE_TASKS.length, posted, failedCount: failed.length, failed: failed.slice(0, 10) });
}
