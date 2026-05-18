import { NextResponse } from "next/server";
import { asanaGids } from "@/lib/server/asanaConfig";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API = "https://app.asana.com/api/1.0";

// One known-existing project — used to discover the team GID that all
// new projects must inherit (Asana Organisations require team on POST).
const REFERENCE_PROJECT_GID = "1214148660020527"; // 01 · Screening

// Each entry corresponds to one of the boards referenced from
// /api/module-report and /api/asana-rebuild-sections that does not yet
// have an Asana project provisioned.
const TARGETS = [
  {
    envVar: "ASANA_AUDIT_LOG_PROJECT_GID",
    name:   "03 · Audit Log 10-Year Trail",
    notes:  "Append-only event chain · audit-trail module",
  },
  {
    envVar: "ASANA_FOUR_EYES_PROJECT_GID",
    name:   "04 · Four-Eyes Approvals",
    notes:  "Second-reviewer sign-off · sar-qa module",
  },
  {
    envVar: "ASANA_COMPLIANCE_OPS_PROJECT_GID",
    name:   "09 · Compliance Ops — Daily & Weekly Tasks",
    notes:  "Routine ops · policies, regulatory, playbook, data-quality, corrections",
  },
  {
    envVar: "ASANA_EMPLOYEES_PROJECT_GID",
    name:   "11 · Employees",
    notes:  "HR registry & doc expiry · employees module",
  },
  {
    envVar: "ASANA_TRAINING_PROJECT_GID",
    name:   "12 · Training",
    notes:  "Staff certification cycle · training module",
  },
  {
    envVar: "ASANA_GOVERNANCE_PROJECT_GID",
    name:   "13 · Compliance Governance",
    notes:  "EWRA, oversight, enforcement deadlines",
  },
  {
    envVar: "ASANA_ROUTINES_PROJECT_GID",
    name:   "14 · Routines — Scheduled",
    notes:  "Cron-style runs · ongoing-monitor module",
  },
  {
    envVar: "ASANA_EXPORT_CTRL_PROJECT_GID",
    name:   "17 · Export Control & Dual-Use",
    notes:  "UAE TFS list & dual-use declarations · eocn module",
  },
] as const;

interface ProjectRecord { gid: string; name: string }

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function discoverTeamGid(token: string): Promise<string | null> {
  const res = await fetch(
    `${API}/projects/${REFERENCE_PROJECT_GID}?opt_fields=team`,
    { headers: authHeaders(token), signal: AbortSignal.timeout(8_000) },
  ).catch((err: unknown) => { console.warn("[hawkeye] asana-create-missing fetch/parse failed:", err); return null; });
  if (!res?.ok) return null;
  const json = (await res.json().catch((err: unknown) => { console.warn("[hawkeye] asana-create-missing fetch/parse failed:", err); return null; })) as
    | { data?: { team?: { gid?: string } } }
    | null;
  return json?.data?.team?.gid ?? null;
}

async function listExistingProjects(
  token: string,
  workspace: string,
): Promise<ProjectRecord[]> {
  const res = await fetch(
    `${API}/workspaces/${workspace}/projects?limit=100&opt_fields=name,gid`,
    { headers: authHeaders(token), signal: AbortSignal.timeout(10_000) },
  ).catch((err: unknown) => { console.warn("[hawkeye] asana-create-missing fetch/parse failed:", err); return null; });
  if (!res?.ok) return [];
  const json = (await res.json().catch((err: unknown) => { console.warn("[hawkeye] asana-create-missing fetch/parse failed:", err); return null; })) as
    | { data?: ProjectRecord[] }
    | null;
  return json?.data ?? [];
}

async function createProject(
  token: string,
  workspace: string,
  team: string | null,
  name: string,
  notes: string,
): Promise<{ gid: string | null; error?: string }> {
  const data: Record<string, unknown> = { name, notes, workspace };
  if (team) data["team"] = team;
  const res = await fetch(`${API}/projects`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(10_000),
  }).catch((err: unknown) => { console.warn("[hawkeye] asana-create-missing fetch/parse failed:", err); return null; });
  if (!res) return { gid: null, error: "network error" };
  const json = (await res.json().catch((err: unknown) => { console.warn("[hawkeye] asana-create-missing fetch/parse failed:", err); return null; })) as
    | { data?: { gid?: string }; errors?: { message?: string }[] }
    | null;
  if (!res.ok || !json?.data?.gid) {
    return {
      gid: null,
      error:
        json?.errors?.[0]?.message ??
        `HTTP ${res.status}`,
    };
  }
  return { gid: json.data.gid };
}

interface Result {
  envVar:    string;
  name:      string;
  gid:       string | null;
  status:    "created" | "already_exists" | "failed";
  error?:    string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "ASANA_TOKEN is not set in Netlify environment variables." },
      { status: 503 },
    );
  }
  const workspace = asanaGids.workspace();

  // Verify token first — fail fast with a helpful message if it's invalid.
  const me = await fetch(`${API}/users/me`, {
    headers: authHeaders(token),
    signal: AbortSignal.timeout(8_000),
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch((err: unknown) => { console.warn("[hawkeye] asana-create-missing fetch/parse failed:", err); return null; }) as { data?: { name?: string } } | null;
  if (!me?.data?.name) {
    return NextResponse.json(
      { ok: false, error: "ASANA_TOKEN is invalid or expired." },
      { status: 401 },
    );
  }

  const team = await discoverTeamGid(token);
  const existing = await listExistingProjects(token, workspace);

  const results: Result[] = [];
  for (const target of TARGETS) {
    // Match by exact name (trimmed) so re-running this is idempotent.
    const found = existing.find((p) => p.name.trim() === target.name.trim());
    if (found) {
      results.push({
        envVar: target.envVar,
        name:   target.name,
        gid:    found.gid,
        status: "already_exists",
      });
      continue;
    }
    const { gid, error } = await createProject(
      token,
      workspace,
      team,
      target.name,
      target.notes,
    );
    if (!gid) {
      results.push({
        envVar: target.envVar,
        name:   target.name,
        gid:    null,
        status: "failed",
        ...(error ? { error } : {}),
      });
      continue;
    }
    results.push({
      envVar: target.envVar,
      name:   target.name,
      gid,
      status: "created",
    });
  }

  // Build a Netlify-ready env block from everything that resolved to a GID.
  const envBlock = results
    .filter((r): r is Result & { gid: string } => r.gid !== null)
    .map((r) => `${r.envVar}=${r.gid}`)
    .join("\n");

  const created       = results.filter((r) => r.status === "created").length;
  const alreadyExists = results.filter((r) => r.status === "already_exists").length;
  const failed        = results.filter((r) => r.status === "failed").length;

  return NextResponse.json({
    ok:               failed === 0,
    authenticatedAs:  me.data.name,
    workspace,
    team,
    summary: { created, alreadyExists, failed, total: results.length },
    results,
    envBlock,
    nextSteps: [
      "1. Copy the `envBlock` above and paste into Netlify → Site config → Environment variables → Import from a .env file.",
      "2. Trigger a new Netlify deploy so the new env vars reach the running functions.",
      "3. POST /api/asana-rebuild-sections to wipe and rebuild section workflows on all 17 boards.",
    ],
  });
}
