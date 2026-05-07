import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const WORKSPACE_GID     = "1213645083721316";
const API               = "https://app.asana.com/api/1.0";
const MASTER_INBOX_GID  = "1214148630166524";

// ── Project matching + workflow sections ────────────────────────────────────
const PROJECT_MAP = [
  {
    match:   ["01", "screening", "sanctions", "watchlist"],
    envVar:  "ASANA_SCREENING_PROJECT_GID",
    label:   "01 · Screening — Sanctions & Watchlists",
    modules: ["Screening", "Ongoing Monitor", "Batch Screen"],
    sections: [
      "📥 New Screens",
      "🔍 Under Review",
      "⚠️  Hit — Escalated to MLRO",
      "✅ Cleared",
      "🗄️  Closed",
    ],
  },
  {
    match:   ["02", "mlro", "daily", "central"],
    envVar:  "ASANA_MLRO_DAILY_PROJECT_GID",
    label:   "02 · Central MLRO Daily Dashboard",
    modules: ["Daily Monitoring"],
    sections: [
      "📥 Today's Queue",
      "🔍 In Progress",
      "📋 Pending Sign-off",
      "✅ Completed",
    ],
  },
  {
    match:   ["05", "str", "sar", "ctr", "pmr"],
    envVar:  "ASANA_SAR_PROJECT_GID",
    label:   "05 · STR/SAR/CTR/PMR",
    modules: ["STR Cases"],
    sections: [
      "📥 New Reports",
      "✏️  Draft",
      "🔍 MLRO Review",
      "📤 Filed to goAML",
      "✅ Closed",
    ],
  },
  {
    match:   ["06", "ffr", "incident", "asset", "freeze"],
    envVar:  "ASANA_FFR_PROJECT_GID",
    label:   "06 · FFR Incidents & Asset Freeze",
    modules: ["Benford Analysis"],
    sections: [
      "📥 New Forensic Reports",
      "🔍 Under Investigation",
      "❄️  Freeze Request Sent",
      "✅ Resolved",
      "🗄️  Closed",
    ],
  },
  {
    match:   ["07", "cdd", "edd", "kyc", "sdd"],
    envVar:  "ASANA_KYC_PROJECT_GID",
    label:   "07 · CDD/SDD/EDD/KYC",
    modules: ["GLEIF / LEI", "Domain Intel", "Crypto Risk"],
    sections: [
      "📥 New Due Diligence",
      "📄 Pending Documents",
      "🔍 Under Review",
      "✅ Approved",
      "❌ Rejected",
      "🗄️  Closed",
    ],
  },
  {
    match:   ["08", "transaction", "monitoring", "tm"],
    envVar:  "ASANA_TM_PROJECT_GID",
    label:   "08 · Transaction Monitoring",
    modules: ["Transaction Monitor"],
    sections: [
      "📥 New Alerts",
      "🔍 Under Review",
      "⚠️  Escalated to MLRO",
      "📤 SAR Filed",
      "✅ Cleared",
    ],
  },
  {
    match:   ["10", "shipment", "tracking", "bullion", "cargo"],
    envVar:  "ASANA_SHIPMENTS_PROJECT_GID",
    label:   "10 · Shipments — Tracking",
    modules: ["Shipments"],
    sections: [
      "📥 New Consignments",
      "🔍 AML Screen Required",
      "✈️  In Transit",
      "🏦 At Vault",
      "🚨 Held — Review Required",
      "✅ Cleared & Delivered",
    ],
  },
  {
    match:   ["15", "mlro workbench", "workbench"],
    envVar:  "ASANA_MLRO_PROJECT_GID",
    label:   "15 · MLRO Workbench",
    modules: ["MLRO Advisor", "Investigation"],
    sections: [
      "📥 New Tasks",
      "🔍 In Progress",
      "⏳ Pending Decision",
      "✅ Approved",
      "🔄 Returned for Revision",
    ],
  },
  {
    match:   ["16", "supply chain", "esg", "trade"],
    envVar:  "ASANA_SUPPLYCHAIN_PROJECT_GID",
    label:   "16 · Supply Chain, ESG & Trade",
    modules: ["Vessel Check"],
    sections: [
      "📥 New Checks",
      "🔍 Under Review",
      "🚨 Sanctions Hit",
      "✅ Cleared",
    ],
  },
] as const;

function nameMatches(name: string, keywords: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

async function asanaGet(token: string, path: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Asana ${res.status} on ${path}`);
  const json = await res.json() as { data: unknown };
  return json.data;
}

async function asanaPost(token: string, path: string, data: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json() as { data: unknown };
  return { ok: res.ok, data: json.data };
}

interface SectionRecord { name: string }
interface ProjectRecord { gid: string; name: string }

async function setupSections(
  token: string,
  projectGid: string,
  desiredSections: readonly string[],
): Promise<{ created: string[]; skipped: string[]; errors: string[] }> {
  const existing = (await asanaGet(token, `/projects/${projectGid}/sections`) as SectionRecord[])
    .map((s) => s.name.toLowerCase().trim());

  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const section of desiredSections) {
    const bare = section.replace(/^[^\w]+/u, "").toLowerCase().trim();
    const exists = existing.some((e) => {
      const eb = e.replace(/^[^\w]+/u, "").toLowerCase().trim();
      return eb.includes(bare) || bare.includes(eb);
    });
    if (exists) { skipped.push(section); continue; }
    const r = await asanaPost(token, `/projects/${projectGid}/sections`, { name: section });
    if (r.ok) created.push(section);
    else errors.push(section);
  }
  return { created, skipped, errors };
}

async function handleSetup(req: Request): Promise<NextResponse> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return NextResponse.json({
      ok: false,
      error: "ASANA_TOKEN is not set in Netlify environment variables.",
      hint: "Netlify → Site configuration → Environment variables → Add ASANA_TOKEN",
    }, { status: 503 });
  }

  // Honour ?dry=true to preview without writing to Asana
  const dry = new URL(req.url).searchParams.get("dry") === "true";

  // Verify token
  const me = await asanaGet(token, "/users/me").catch(() => null) as { name?: string; email?: string } | null;
  if (!me?.name) {
    return NextResponse.json({ ok: false, error: "ASANA_TOKEN is invalid or expired." }, { status: 401 });
  }

  // Fetch all workspace projects
  const projects = await asanaGet(
    token,
    `/workspaces/${WORKSPACE_GID}/projects?limit=100`,
  ).catch(() => null) as ProjectRecord[] | null;

  if (!projects) {
    return NextResponse.json({ ok: false, error: "Failed to fetch workspace projects." }, { status: 502 });
  }

  const results: Array<{
    envVar: string;
    label: string;
    modules: readonly string[];
    projectName: string | null;
    gid: string | null;
    currentEnvValue: string | null;
    alreadyConfigured: boolean;
    sections?: { created: string[]; skipped: string[]; errors: string[] };
    fallback: boolean;
  }> = [];

  for (const mapping of PROJECT_MAP) {
    const found = projects.find((p) => nameMatches(p.name, mapping.match));
    const currentEnv = process.env[mapping.envVar] ?? null;
    const alreadyConfigured = !!currentEnv;

    if (!found) {
      results.push({
        envVar: mapping.envVar,
        label: mapping.label,
        modules: mapping.modules,
        projectName: null,
        gid: null,
        currentEnvValue: currentEnv,
        alreadyConfigured,
        fallback: true,
      });
      continue;
    }

    let sections: { created: string[]; skipped: string[]; errors: string[] } | undefined;
    if (!dry) {
      sections = await setupSections(token, found.gid, mapping.sections).catch((err: unknown) => {
        console.warn(`[hawkeye] asana-setup setupSections failed for ${mapping.label}:`, err);
        return undefined;
      });
    }

    results.push({
      envVar: mapping.envVar,
      label: mapping.label,
      modules: mapping.modules,
      projectName: found.name,
      gid: found.gid,
      currentEnvValue: currentEnv,
      alreadyConfigured,
      sections,
      fallback: false,
    });
  }

  const matched    = results.filter((r) => r.gid);
  const unmatched  = results.filter((r) => !r.gid);
  const needsEnv   = matched.filter((r) => !r.alreadyConfigured);
  const alreadySet = matched.filter((r) =>  r.alreadyConfigured);

  return NextResponse.json({
    ok: true,
    dry,
    authenticatedAs: { name: me.name, email: me.email },
    summary: {
      projectsInWorkspace: projects.length,
      matched: matched.length,
      unmatched: unmatched.length,
      alreadyConfigured: alreadySet.length,
      needsConfiguration: needsEnv.length,
    },
    results,
    // Ready-to-paste env vars for Netlify
    netlifyEnvVars: matched.map((r) => ({
      key: r.envVar,
      value: r.gid,
      board: r.label,
      modules: r.modules,
      status: r.alreadyConfigured ? "already_set" : "needs_setting",
    })),
    unmatchedProjects: unmatched.map((r) => ({
      envVar: r.envVar,
      board: r.label,
      hint: "Create this project in Asana or check the project name matches",
      fallback: `Tasks will go to Master Inbox (${MASTER_INBOX_GID}) until this is set`,
    })),
    instructions: [
      "1. Go to Netlify → hawkeye-sterling → Site configuration → Environment variables",
      "2. Add each key/value pair from netlifyEnvVars where status = 'needs_setting'",
      "3. Trigger a new Netlify deploy (or wait for the next one)",
      "4. Call this endpoint again to verify — all statuses should show 'already_set'",
    ],
  });
}

export const GET = withGuard(handleSetup);
