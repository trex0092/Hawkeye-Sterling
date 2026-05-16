// Daily sanctions status report — 08:30 GST (04:30 UTC).
// Posts an Asana task with per-list health, entity counts, and any
// degraded-list action items. See src/integrations/sanctions-daily-report.ts.

import type { Config } from "@netlify/functions";
import { runSanctionsReport } from "../../dist/src/integrations/sanctions-daily-report.js";

export default async (_req: Request): Promise<Response> => {
  const baseUrl =
    process.env["URL"] ??
    process.env["DEPLOY_PRIME_URL"] ??
    "https://hawkeye-sterling.netlify.app";

  const result = await runSanctionsReport({
    reportLabel: "08:30 GST",
    nextLabel:   "13:00 GST",
    baseUrl,
  });

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "content-type": "application/json" },
  });
};

export const config: Config = { schedule: "30 4 * * *" };
