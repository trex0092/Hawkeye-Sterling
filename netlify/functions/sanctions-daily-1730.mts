// Daily sanctions status report — 17:30 GST (13:30 UTC).
// Posts an Asana task with per-list health, entity counts, and any
// degraded-list action items. See src/integrations/sanctions-daily-report.ts.

import type { Config } from "@netlify/functions";
import { runSanctionsReport } from "../../dist/src/integrations/sanctions-daily-report.js";
import { writeHeartbeat } from "../lib/heartbeat.js";

export default async (_req: Request): Promise<Response> => {
  const baseUrl =
    process.env["URL"] ??
    process.env["DEPLOY_PRIME_URL"] ??
    "https://hawkeye-sterling.netlify.app";

  const result = await runSanctionsReport({
    reportLabel: "17:30 GST",
    nextLabel:   "08:30 GST tomorrow",
    baseUrl,
  });

  if (result.ok) await writeHeartbeat("sanctions-daily-1730");
  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "content-type": "application/json" },
  });
};

export const config: Config = { schedule: "30 13 * * *" };
