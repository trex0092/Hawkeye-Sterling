import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PROJECT_GID   = "1214148630166524"; // 00 · Master Inbox
const DEFAULT_WORKSPACE_GID = "1213645083721316";
const DEFAULT_ASSIGNEE_GID  = "1213645083721304"; // Luisa Fernanda

const MODULE_LABELS: Record<string, string> = {
  benford:         "Benford Analysis",
  gleif:           "GLEIF / LEI",
  "domain-intel":  "Domain Intel",
  "crypto-risk":   "Crypto Risk",
  "vessel-check":  "Vessel Check",
  shipments:       "Shipments",
  "mlro-advisor":  "MLRO Advisor",
  investigation:   "Investigation",
  analytics:       "Analytics",
  "ongoing-monitor": "Ongoing Monitor",
  screening:       "Screening",
  osint:           "OSINT",
  workbench:       "Workbench",
};

interface Body {
  module: string;
  label: string;
  summary: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

interface ApiResponse {
  ok: boolean;
  taskGid?: string;
  taskUrl?: string;
  error?: string;
  detail?: string;
}

function respond(status: number, body: ApiResponse): NextResponse {
  return NextResponse.json(body, { status });
}

function buildNotes(b: Body, gen: Date): string {
  const moduleLabel = MODULE_LABELS[b.module] ?? b.module.toUpperCase();
  const lines: string[] = [];
  lines.push(`HAWKEYE STERLING · ${moduleLabel.toUpperCase()} MODULE REPORT`);
  lines.push(`Generated   : ${gen.toUTCString().replace(" GMT", " UTC")}`);
  lines.push(`Module      : ${moduleLabel}`);
  lines.push(`Subject     : ${b.label}`);
  lines.push("");
  lines.push(`SUMMARY`);
  lines.push(b.summary);
  lines.push("");
  if (b.metadata && Object.keys(b.metadata).length > 0) {
    lines.push(`DETAIL`);
    for (const [k, v] of Object.entries(b.metadata)) {
      const val = typeof v === "object" ? JSON.stringify(v) : String(v);
      lines.push(`${k.padEnd(18, " ")}: ${val}`);
    }
    lines.push("");
  }
  const pageUrl = b.url ?? `https://hawkeye-sterling.netlify.app/${b.module}`;
  lines.push(`Module URL  : ${pageUrl}`);
  lines.push(`Legal basis : FDL 10/2025 Art.26-27 · CR 134/2025 Art.18 · 10-year retention`);
  return lines.join("\n");
}

async function handleModuleReport(req: Request): Promise<NextResponse> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return respond(503, {
      ok: false,
      error: "asana not configured",
      detail: "Set ASANA_TOKEN in Netlify env vars for the hawkeye-sterling site.",
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return respond(400, { ok: false, error: "invalid JSON body" });
  }
  if (!body?.module || !body?.label || !body?.summary) {
    return respond(400, { ok: false, error: "module, label and summary are required" });
  }

  const gen = new Date();
  const moduleLabel = MODULE_LABELS[body.module] ?? body.module.toUpperCase();
  const taskName = `[${moduleLabel.toUpperCase()}] ${body.label} · ${gen.toISOString().slice(0, 10)}`;
  const notes = buildNotes(body, gen);

  const TIMEOUT_MS = 10_000;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    let asanaRes: Response;
    try {
      asanaRes = await fetch("https://app.asana.com/api/1.0/tasks", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          data: {
            name: taskName,
            notes,
            projects: [process.env["ASANA_PROJECT_GID"] ?? DEFAULT_PROJECT_GID],
            workspace: process.env["ASANA_WORKSPACE_GID"] ?? DEFAULT_WORKSPACE_GID,
            assignee: process.env["ASANA_ASSIGNEE_GID"] ?? DEFAULT_ASSIGNEE_GID,
          },
        }),
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const payload = (await asanaRes.json().catch(() => null)) as
      | { data?: { gid?: string; permalink_url?: string }; errors?: { message?: string }[] }
      | null;

    if (!asanaRes.ok || !payload?.data?.gid) {
      const msg = payload?.errors?.[0]?.message ?? `HTTP ${asanaRes.status}`;
      const mappedStatus =
        asanaRes.status >= 500 ? 502
        : asanaRes.status === 401 || asanaRes.status === 403 ? 503
        : 422;
      return respond(mappedStatus, { ok: false, error: "asana rejected the task", detail: msg });
    }

    return respond(201, {
      ok: true,
      taskGid: payload.data.gid,
      ...(payload.data.permalink_url ? { taskUrl: payload.data.permalink_url } : {}),
    });
  } catch (err) {
    return respond(500, {
      ok: false,
      error: "asana request failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

export const POST = withGuard(handleModuleReport);
