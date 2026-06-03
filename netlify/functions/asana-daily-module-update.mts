// Netlify Scheduled Function — daily Asana module compliance attestation.
//
// Once a day, self-POSTs to /api/asana-daily-module-update, which posts a
// "daily compliance attestation" comment to every task on the
// "Hawkeye Sterling — Modules" Asana board (one task per module).
//
// Keeps the cron a dumb tickler — all Asana logic lives in the API route
// (one place, covered by the same env gate). No-op (logs) when the
// HAWKEYE_CRON_TOKEN / ASANA_TOKEN env vars are unset.
//
// Schedule: 06:00 UTC daily = 10:00 Asia/Dubai — start of the UAE
// business day, so the MLRO sees a fresh per-module status each morning.
//
// Auth: HAWKEYE_CRON_TOKEN — the shared server-to-server cron bearer
// already used by the other scheduled functions (e.g. freeze-sla-monitor),
// so no new env var is needed.

import type { Config } from "@netlify/functions";

export default async (_req: Request): Promise<Response> => {
  const token = process.env["HAWKEYE_CRON_TOKEN"];
  const base =
    process.env["URL"] ?? process.env["DEPLOY_PRIME_URL"] ?? "https://hawkeye-sterling.netlify.app";

  if (!token) {
    console.warn("[asana-daily] HAWKEYE_CRON_TOKEN unset — skipping daily module attestation.");
    return new Response("skipped: no cron token", { status: 200 });
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 50_000);
    const res = await fetch(`${base}/api/asana-daily-module-update`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const body = await res.json().catch(() => ({}));
    console.info("[asana-daily] result:", res.status, JSON.stringify(body));
  } catch (err) {
    // Always 200 — a failed daily attestation must not mark the scheduled
    // function as hard-failed; it retries next day and logs the cause.
    console.error("[asana-daily] failed:", err instanceof Error ? err.message : String(err));
  }
  return new Response("ok", { status: 200 });
};

export const config: Config = {
  schedule: "0 6 * * *",
};
