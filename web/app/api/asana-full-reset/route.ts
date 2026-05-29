import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const API = "https://app.asana.com/api/1.0";

const PROJECTS = [
  {
    gid: "1214148660020527",
    name: "01 · Screening — Sanctions & Adverse Media",
    sections: ["📥 New Screens", "🔍 Under Review", "⚠️  Hit — Escalated to MLRO", "✅ Cleared", "🗄️  Closed"],
  },
  {
    gid: "1214148631086118",
    name: "02 · Central MLRO Daily Digest",
    sections: ["📥 Today's Queue", "🔍 In Progress", "📋 Pending Sign-off", "✅ Completed"],
  },
  {
    gid: process.env["ASANA_AUDIT_LOG_PROJECT_GID"] ?? "",
    name: "03 · Audit Log 10-Year Trail",
    sections: ["📥 New Entries", "🔍 Under Review", "✅ Signed Off", "🗄️  Archived"],
  },
  {
    gid: process.env["ASANA_FOUR_EYES_PROJECT_GID"] ?? "",
    name: "04 · Four-Eyes Approvals",
    sections: ["📥 Awaiting First Review", "🔍 Awaiting Second Review", "⚠️  Discrepancy — Escalate", "✅ Dual-Approved", "❌ Rejected"],
  },
  {
    gid: "1214148631336502",
    name: "05 · STR/SAR/CTR/PMR GoAML Filings",
    sections: ["📥 New Reports", "✏️  Draft", "🔍 MLRO Review", "📤 Filed to goAML", "✅ Closed"],
  },
  {
    gid: "1214148643568798",
    name: "06 · FFR Incidents & Asset Freezes",
    sections: ["📥 New Forensic Reports", "🔍 Under Investigation", "❄️  Freeze Request Sent", "✅ Resolved", "🗄️  Closed"],
  },
  {
    gid: "1214148898062562",
    name: "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
    sections: ["📥 New Due Diligence", "📄 Pending Documents", "🔍 Under Review", "✅ Approved", "❌ Rejected", "🗄️  Closed"],
  },
  {
    gid: "1214148661083263",
    name: "08 · Transaction Monitoring",
    sections: ["📥 New Alerts", "🔍 Under Review", "⚠️  Escalated to MLRO", "📤 SAR Filed", "✅ Cleared"],
  },
  {
    gid: process.env["ASANA_COMPLIANCE_OPS_PROJECT_GID"] ?? "",
    name: "09 · Compliance Ops — Daily & Weekly Tasks",
    sections: ["📥 New Tasks", "📅 Scheduled", "🔍 In Progress", "✅ Completed"],
  },
  {
    gid: "1214148910059926",
    name: "10 · Shipments — Tracking",
    sections: ["📥 New Consignments", "🔍 AML Screen Required", "✈️  In Transit", "🏦 At Vault", "🚨 Held — Review Required", "✅ Cleared & Delivered"],
  },
  {
    gid: process.env["ASANA_EMPLOYEES_PROJECT_GID"] ?? "",
    name: "11 · Employees",
    sections: ["📥 New Records", "🔍 Under Review", "✅ Cleared", "⚠️  Flagged"],
  },
  {
    gid: process.env["ASANA_TRAINING_PROJECT_GID"] ?? "",
    name: "12 · Training",
    sections: ["📥 New Requests", "📅 Scheduled", "✅ Completed", "🔄 Renewal Due"],
  },
  {
    gid: process.env["ASANA_GOVERNANCE_PROJECT_GID"] ?? "",
    name: "13 · Compliance Governance",
    sections: ["📥 New Items", "🔍 Under Review", "📋 Pending Board Approval", "✅ Approved", "🗄️  Archived"],
  },
  {
    gid: process.env["ASANA_ROUTINES_PROJECT_GID"] ?? "",
    name: "14 · Routines — Scheduled",
    sections: ["📅 Scheduled", "🔍 Running", "⚠️  Alert Generated", "✅ Completed"],
  },
  {
    gid: "1214148910059926",
    name: "15 · MLRO Workbench",
    sections: ["📥 New Tasks", "🔍 In Progress", "⏳ Pending Decision", "✅ Approved", "🔄 Returned for Revision"],
  },
  {
    gid: "1214148855758874",
    name: "16 · Supply Chain, ESG & LBMA Gold",
    sections: ["📥 New Checks", "🔍 Under Review", "🚨 Sanctions Hit", "✅ Cleared"],
  },
  {
    gid: process.env["ASANA_EXPORT_CTRL_PROJECT_GID"] ?? "",
    name: "17 · Export Control & Dual-Use",
    sections: ["📥 New Submissions", "🔍 Under Review", "⚠️  Dual-Use Flag", "✅ Cleared", "❌ Refused"],
  },
  {
    gid: process.env["ASANA_REGULATOR_PROJECT_GID"] ?? "",
    name: "18 · Regulator Portal Handoff",
    sections: ["📥 New Submissions", "✏️  Draft", "🔍 Under Review", "📤 Submitted", "✅ Acknowledged"],
  },
  {
    gid: process.env["ASANA_INCIDENTS_PROJECT_GID"] ?? "",
    name: "19 · Incidents & Grievances",
    sections: ["📥 New Incident", "🔍 Under Investigation", "⚠️  Escalated", "✅ Resolved", "🗄️  Closed"],
  },
].filter((p) => p.gid !== "") as Array<{ gid: string; name: string; sections: readonly string[] }>;

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" };
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fetch all task GIDs in a project (handles pagination). */
async function getTaskGids(token: string, projectGid: string): Promise<string[]> {
  const gids: string[] = [];
  let offset: string | null = null;
  do {
    const url = `${API}/projects/${projectGid}/tasks?limit=100&opt_fields=gid${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`;
    const res = await fetch(url, {
      headers: authHeaders(token),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) break;
    const json = (await res.json()) as {
      data: Array<{ gid: string }>;
      next_page?: { offset: string } | null;
    };
    for (const t of json.data) gids.push(t.gid);
    offset = json.next_page?.offset ?? null;
  } while (offset);
  return gids;
}

/** Delete a single task. Silent on 404 (already gone). */
async function deleteTask(token: string, taskGid: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/tasks/${taskGid}`, {
      method: "DELETE",
      headers: authHeaders(token),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/** Delete tasks in chunks of 5 concurrently to stay within Asana rate limits. */
async function wipeTasks(token: string, projectGid: string): Promise<{ wiped: number; failed: number }> {
  const gids = await getTaskGids(token, projectGid);
  let wiped = 0;
  let failed = 0;
  const CHUNK = 5;
  for (let i = 0; i < gids.length; i += CHUNK) {
    const chunk = gids.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map((gid) => deleteTask(token, gid)));
    for (const ok of results) ok ? wiped++ : failed++;
    if (i + CHUNK < gids.length) await delay(200);
  }
  return { wiped, failed };
}

async function getSections(token: string, projectGid: string): Promise<Array<{ gid: string }>> {
  const res = await fetch(`${API}/projects/${projectGid}/sections?opt_fields=gid`, {
    headers: authHeaders(token),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { data: Array<{ gid: string }> };
  return json.data;
}

async function deleteSection(token: string, sectionGid: string): Promise<void> {
  await fetch(`${API}/sections/${sectionGid}`, {
    method: "DELETE",
    headers: authHeaders(token),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => {});
}

async function createSection(token: string, projectGid: string, name: string): Promise<boolean> {
  const res = await fetch(`${API}/projects/${projectGid}/sections`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ data: { name } }),
    signal: AbortSignal.timeout(8_000),
  });
  return res.ok;
}

export async function POST(): Promise<NextResponse> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return NextResponse.json({ ok: false, error: "ASANA_TOKEN not configured." }, { status: 503 });
  }

  // Verify token
  const me = await fetch(`${API}/users/me`, {
    headers: authHeaders(token),
    signal: AbortSignal.timeout(8_000),
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null) as { data?: { name: string } } | null;

  if (!me?.data?.name) {
    return NextResponse.json({ ok: false, error: "ASANA_TOKEN is invalid or expired." }, { status: 401 });
  }

  const results: Array<{
    name: string;
    tasksWiped: number;
    tasksFailed: number;
    sectionsDeleted: number;
    sectionsCreated: number;
    errors: string[];
  }> = [];

  for (const project of PROJECTS) {
    const errors: string[] = [];
    let tasksWiped = 0;
    let tasksFailed = 0;
    let sectionsDeleted = 0;
    let sectionsCreated = 0;

    try {
      // 1. Wipe all tasks
      const wipeResult = await wipeTasks(token, project.gid);
      tasksWiped = wipeResult.wiped;
      tasksFailed = wipeResult.failed;
      if (tasksFailed > 0) errors.push(`${tasksFailed} task(s) failed to delete`);

      await delay(300);

      // 2. Delete all existing sections
      const existing = await getSections(token, project.gid);
      for (const sec of existing) {
        await deleteSection(token, sec.gid);
        sectionsDeleted++;
        await delay(100);
      }

      await delay(400);

      // 3. Recreate sections in correct order
      for (const sectionName of project.sections) {
        const ok = await createSection(token, project.gid, sectionName);
        if (ok) sectionsCreated++;
        else errors.push(`create section: ${sectionName}`);
        await delay(150);
      }
    } catch (err) {
      errors.push(String(err));
    }

    results.push({ name: project.name, tasksWiped, tasksFailed, sectionsDeleted, sectionsCreated, errors });
  }

  const allOk = results.every((r) => r.errors.length === 0);
  return NextResponse.json({
    ok: allOk,
    authenticatedAs: me.data.name,
    results,
  });
}
