// Netlify Background Function — MLRO Advisor deep reasoning.
//
// The synchronous /api/mlro-advisor route is hard-capped at 22 s
// because Netlify's edge layer enforces a ~26 s inactivity timeout
// regardless of route-level maxDuration. This background function
// runs outside that constraint (15-minute platform ceiling on the
// Free tier; longer on paid plans) and therefore lets the advisor
// finish the full multi-perspective pipeline.
//
// Contract:
//   POST /.netlify/functions/mlro-advisor-deep-background
//   body: {
//     jobId: string,            // client-generated uuid; used as Blobs key
//     question: string,
//     mode?: "balanced" | "multi_perspective",
//     audience?: "regulator" | "operator" | "internal",
//     budgetMs?: number,        // capped at 800_000 (~13 min)
//   }
//
// Netlify acknowledges the POST with HTTP 202 and runs the handler
// asynchronously. The handler writes its result to Netlify Blobs at
// `advisor-jobs/<jobId>` so the client (or the GET poll endpoint at
// /api/advisor-job/[jobId]) can pick it up.

import { getStore } from "@netlify/blobs";
// Compiled at build time by `tsc` at the repo root.
import {
  invokeMlroAdvisor,
  type MlroAdvisorRequest,
} from "../../dist/src/integrations/mlroAdvisor.js";

interface Body {
  jobId?: string;
  question?: string;
  mode?: "balanced" | "multi_perspective";
  audience?: "regulator" | "operator" | "internal";
  budgetMs?: number;
}

interface JobRecord {
  status: "running" | "done" | "failed";
  startedAt: string;
  finishedAt?: string;
  question: string;
  mode: "balanced" | "multi_perspective";
  // Raw advisor response. The shape mirrors invokeMlroAdvisor's
  // success branch when status === "done".
  result?: unknown;
  error?: string;
}

const STORE_NAME = "hawkeye-sterling";
const KEY_PREFIX = "advisor-jobs";

function buildStoreOptions(): Parameters<typeof getStore>[0] {
  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token =
    process.env["NETLIFY_BLOBS_TOKEN"] ??
    process.env["NETLIFY_API_TOKEN"] ??
    process.env["NETLIFY_AUTH_TOKEN"];
  if (siteID && token) {
    return { name: STORE_NAME, siteID, token, consistency: "strong" };
  }
  return { name: STORE_NAME };
}

async function writeJob(jobId: string, record: JobRecord): Promise<void> {
  const store = getStore(buildStoreOptions());
  await store.set(`${KEY_PREFIX}/${jobId}`, JSON.stringify(record));
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "POST only" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const jobId = body.jobId?.trim();
  const question = body.question?.trim();
  if (!jobId || !question) {
    return new Response(
      JSON.stringify({ ok: false, error: "jobId + question required" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    await writeJob(jobId, {
      status: "failed",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      question,
      mode: body.mode ?? "multi_perspective",
      error: "ANTHROPIC_API_KEY not set",
    });
    return new Response(
      JSON.stringify({ ok: false, jobId, error: "ANTHROPIC_API_KEY not set" }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const mode: "balanced" | "multi_perspective" = body.mode ?? "multi_perspective";
  const budgetMs = Math.min(body.budgetMs ?? 800_000, 800_000);

  // Mark the job as running BEFORE we kick off the advisor so the poll
  // endpoint reports the right state during the long invocation.
  await writeJob(jobId, {
    status: "running",
    startedAt: new Date().toISOString(),
    question,
    mode,
  });

  // Build the same request envelope the synchronous route uses, minus
  // the screening-context scaffolding (this is a Q&A flow, not a case).
  const advisorReq: MlroAdvisorRequest = {
    question,
    mode,
    audience: body.audience ?? "regulator",
    caseContext: {
      caseId: `bg-${jobId}`,
      subjectName: "Regulatory Query",
      entityType: "individual",
      scope: {
        listsChecked: [
          "OFAC-SDN",
          "OFAC-Non-SDN",
          "UN-Consolidated",
          "EU-Consolidated",
          "UK-OFSI",
          "UAE-EOCN",
          "UAE-LTL",
        ],
        listVersionDates: {},
        jurisdictions: [],
        matchingMethods: ["exact", "levenshtein", "jaro_winkler"],
      },
      evidenceIds: [],
    },
  };

  try {
    const result = await invokeMlroAdvisor(advisorReq, { apiKey, budgetMs });
    await writeJob(jobId, {
      status: result.ok ? "done" : "failed",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      question,
      mode,
      result,
      ...(result.ok ? {} : { error: result.error ?? "advisor returned not-ok" }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await writeJob(jobId, {
      status: "failed",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      question,
      mode,
      error: detail,
    });
  }

  // Background functions return 202 — the client polls /api/advisor-job
  // for the final answer.
  return new Response(JSON.stringify({ ok: true, jobId }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
};
