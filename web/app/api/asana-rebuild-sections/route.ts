import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API = "https://app.asana.com/api/1.0";

// Each board's section list mirrors the lifecycle the matching app
// module(s) actually expose — see web/app/api/module-report/route.ts for
// the module-to-board routing this complements. POST this endpoint to
// wipe and rebuild every board's sections in the correct order.
//
// GIDs for the 9 boards already provisioned in production are hardcoded.
// GIDs for the remaining boards are read from env vars — create the
// project in Asana, set its GID env var in Netlify, then POST again.
const PROJECTS = [
  {
    // Primary nav: Screening, Batch · Governance: AM Lookback
    gid: "1214148660020527",
    name: "01 · Screening — Sanctions & Adverse Media",
    sections: ["📥 New Screens", "🔍 Under Review", "⚠️  Hit — Escalated to MLRO", "✅ Cleared", "🗄️  Closed"],
  },
  {
    // Intelligence: Analytics
    gid: "1214148631086118",
    name: "02 · Central MLRO Daily Digest",
    sections: ["📥 Today's Queue", "🔍 In Progress", "📋 Pending Sign-off", "✅ Completed"],
  },
  {
    // Governance: Audit (immutable audit chain)
    gid: process.env["ASANA_AUDIT_LOG_PROJECT_GID"] ?? "",
    name: "03 · Audit Log 10-Year Trail",
    sections: ["📥 New Events", "🔐 Sealed Chain", "📦 Archived (Year-end)"],
  },
  {
    // Governance: SAR QA (literal four-eyes review)
    gid: process.env["ASANA_FOUR_EYES_PROJECT_GID"] ?? "",
    name: "04 · Four-Eyes Approvals",
    sections: ["📥 Awaiting Reviewer", "🔍 Under Review", "✅ Approved", "↩️  Returned for Revision"],
  },
  {
    // Primary nav: STR/SAR, Cases
    gid: "1214148631336502",
    name: "05 · STR/SAR/CTR/PMR GoAML Filings",
    sections: ["📥 New Reports", "✏️  Draft", "🔍 MLRO Review", "📤 Filed to goAML", "✅ Closed"],
  },
  {
    // Enrichment: Benford (forensic fraud detection)
    gid: "1214148643568798",
    name: "06 · FFR Incidents & Asset Freezes",
    sections: ["📥 New Forensic Flags", "🔍 Under Investigation", "❄️  Freeze Request Sent", "✅ Resolved", "🗄️  Closed"],
  },
  {
    // Enrichment + Operations: GLEIF, Domain Intel, Crypto Risk, Client portal,
    // UBO declaration, Supplier DD, CDD Review
    gid: "1214148898062562",
    name: "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
    sections: ["📥 New Onboarding", "📄 Pending Documents", "🔍 Under Review", "✅ Approved", "❌ Rejected", "🔄 Periodic Re-KYC"],
  },
  {
    // Primary nav: Transaction monitor
    gid: "1214148661083263",
    name: "08 · Transaction Monitoring",
    sections: ["📥 New Alerts", "🔍 Under Review", "⚠️  Escalated to MLRO", "📤 SAR Filed", "✅ Cleared"],
  },
  {
    // Governance + Operations: Regulatory, Policies, Playbook, Data quality, Corrections
    gid: process.env["ASANA_COMPLIANCE_OPS_PROJECT_GID"] ?? "",
    name: "09 · Compliance Ops — Daily & Weekly Tasks",
    sections: ["📥 New Tasks", "🔍 In Progress", "⏳ Awaiting Approval", "✅ Completed"],
  },
  {
    // Operations: Shipments (bullion chain-of-custody)
    gid: "1214148898360626",
    name: "10 · Shipments — Tracking",
    sections: ["📥 New Consignments", "🔍 AML Screen Required", "✈️  In Transit", "🏦 At Vault", "🚨 Held — Review Required", "✅ Cleared & Delivered"],
  },
  {
    // Operations: Employees (HR registry, doc expiry)
    gid: process.env["ASANA_EMPLOYEES_PROJECT_GID"] ?? "",
    name: "11 · Employees",
    sections: ["📥 New Joiners", "📄 Documents Pending", "⏰ Expiring Soon", "✅ Compliant", "🚪 Offboarded"],
  },
  {
    // Operations: Training (staff certification)
    gid: process.env["ASANA_TRAINING_PROJECT_GID"] ?? "",
    name: "12 · Training",
    sections: ["📥 Assigned", "📚 In Progress", "✅ Completed", "⏰ Recertification Due"],
  },
  {
    // Governance: EWRA, Oversight, Enforcement
    gid: process.env["ASANA_GOVERNANCE_PROJECT_GID"] ?? "",
    name: "13 · Compliance Governance",
    sections: ["📥 New Items", "🔍 Under Review", "📋 Awaiting Board Sign-off", "✅ Approved", "🗄️  Archived"],
  },
  {
    // Primary nav: Monitoring (ongoing-monitor scheduled runs)
    gid: process.env["ASANA_ROUTINES_PROJECT_GID"] ?? "",
    name: "14 · Routines — Scheduled",
    sections: ["⏰ Scheduled", "🔄 Running", "✅ Completed", "❌ Failed — Retry"],
  },
  {
    // Primary nav: MLRO Advisor, Intel
    // Intelligence: Workbench, Investigation, Brain, OSINT
    gid: "1214148910059926",
    name: "15 · MLRO Workbench",
    sections: ["📥 New Tasks", "🔍 In Progress", "⏳ Pending Decision", "✅ Decided", "🔄 Returned for Revision"],
  },
  {
    // Enrichment + Governance: Vessel Check, RMI / RMAP
    gid: "1214148855758874",
    name: "16 · Supply Chain, ESG & LBMA Gold",
    sections: ["📥 New Checks", "🔍 Under Review", "🚨 Sanctions Hit", "✅ Cleared"],
  },
  {
    // Governance: EOCN (UAE TFS list & dual-use declarations)
    gid: process.env["ASANA_EXPORT_CTRL_PROJECT_GID"] ?? "",
    name: "17 · Export Control & Dual-Use",
    sections: ["📥 New Declarations", "🔍 Under Review", "⚠️  Dual-Use Flagged", "✅ Cleared"],
  },
].filter(p => p.gid !== "") as Array<{ gid: string; name: string; sections: readonly string[] }>;

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" };
}

async function getSections(token: string, projectGid: string): Promise<Array<{ gid: string; name: string }>> {
  const res = await fetch(`${API}/projects/${projectGid}/sections`, {
    headers: headers(token),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`getSections ${res.status}`);
  const json = await res.json() as { data: Array<{ gid: string; name: string }> };
  return json.data;
}

async function deleteSection(token: string, sectionGid: string): Promise<void> {
  await fetch(`${API}/sections/${sectionGid}`, {
    method: "DELETE",
    headers: headers(token),
    signal: AbortSignal.timeout(8_000),
  });
}

async function createSection(token: string, projectGid: string, name: string): Promise<boolean> {
  const res = await fetch(`${API}/projects/${projectGid}/sections`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ data: { name } }),
    signal: AbortSignal.timeout(8_000),
  });
  return res.ok;
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(): Promise<NextResponse> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return NextResponse.json({
      ok: false,
      error: "ASANA_TOKEN environment variable is not set in Netlify.",
    }, { status: 503 });
  }

  // Verify token
  const me = await fetch(`${API}/users/me`, {
    headers: headers(token),
    signal: AbortSignal.timeout(8_000),
  }).then((r) => r.ok ? r.json() : null).catch(() => null) as { data?: { name: string } } | null;

  if (!me?.data?.name) {
    return NextResponse.json({ ok: false, error: "ASANA_TOKEN is invalid or expired." }, { status: 401 });
  }

  const results: Array<{
    name: string;
    deleted: number;
    created: number;
    errors: string[];
  }> = [];

  for (const project of PROJECTS) {
    const errors: string[] = [];
    let deleted = 0;
    let created = 0;

    try {
      // 1. Fetch existing sections
      const existing = await getSections(token, project.gid);

      // 2. Delete all existing sections
      for (const sec of existing) {
        try {
          await deleteSection(token, sec.gid);
          deleted++;
        } catch {
          errors.push(`delete:${sec.name}`);
        }
        await delay(100);
      }

      await delay(400);

      // 3. Recreate in correct order
      for (const sectionName of project.sections) {
        try {
          const ok = await createSection(token, project.gid, sectionName);
          if (ok) created++;
          else errors.push(`create:${sectionName}`);
        } catch {
          errors.push(`create:${sectionName}`);
        }
        await delay(150);
      }
    } catch (err) {
      errors.push(String(err));
    }

    results.push({ name: project.name, deleted, created, errors });
  }

  const allOk = results.every((r) => r.errors.length === 0);
  return NextResponse.json({
    ok: allOk,
    authenticatedAs: me.data.name,
    results,
  });
}
