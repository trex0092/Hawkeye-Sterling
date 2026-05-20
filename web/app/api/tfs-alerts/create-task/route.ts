// POST /api/tfs-alerts/create-task
// Creates a compliance task in Asana for a TFS alert.
// Requires ASANA_PAT env var (Asana Personal Access Token).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

const ASANA_PROJECT_GID = "1214148630166524";
const ASANA_ASSIGNEE_GID = "1213645083721304";
const ASANA_API_BASE = "https://app.asana.com/api/1.0";

interface CreateTaskRequest {
  threadId: string;
  subject: string;
  sender: string;
  dateReceived: string;
  snippet: string;
  alertType: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Dubai",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Dubai",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function dueDateStr(dateReceived: string): string {
  try {
    const d = new Date(dateReceived);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0]!;
  } catch {
    return new Date(Date.now() + 86400000).toISOString().split("T")[0]!;
  }
}

function buildTaskName(alertType: string, dateReceived: string): string {
  return `🚨 TFS ALERT — ${alertType} Updated — Screen Required — ${formatDate(dateReceived)}`;
}

function buildTaskNotes(
  subject: string,
  sender: string,
  dateReceived: string,
  snippet: string,
): string {
  return `⚠️ TFS ALERT — MANDATORY ACTION REQUIRED WITHIN 24 HOURS

SOURCE: EOCN Notification Alert System
SENDER: ${sender}
RECEIVED: ${formatDateTime(dateReceived)}
SUBJECT: ${subject}
PREVIEW: ${snippet}

──────────────────────────────────────────────────
MANDATORY COMPLIANCE ACTIONS (DO NOT SKIP ANY):
──────────────────────────────────────────────────

□ STEP 1 — Screen full customer database against
           the updated sanctions list immediately

□ STEP 2 — Document all screening results with
           timestamps and analyst name

□ STEP 3 — CONFIRMED MATCH FOUND?
           → Freeze funds immediately without notice
           → File Fund Freeze Report (FFR) via goAML
           → Deadline: within 5 business days

□ STEP 4 — POTENTIAL MATCH FOUND?
           → Suspend transaction immediately
           → File Partial Name Match Report (PNMR) via goAML
           → Deadline: within 5 business days

□ STEP 5 — NO MATCH?
           → Document false positive analysis
           → Retain evidence on file for minimum 5 years

──────────────────────────────────────────────────
REGULATORY BASIS:
Cabinet Resolution No. 74 of 2020 | Article 21
Federal Decree-Law No. 10 of 2025
Cabinet Resolution No. 134 of 2025

SCREENING DEADLINE: 24 hours from alert receipt
REPORTING DEADLINE: 5 business days if match found`;
}

export interface CreateTaskResponse {
  ok: true;
  taskId: string;
  taskUrl: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const token =
    process.env["ASANA_PAT"] ??
    process.env["ASANA_TOKEN"] ??
    process.env["ASANA_MCP_TOKEN"] ??
    "";

  if (!token) {
    return NextResponse.json({ ok: false, error: "ASANA_NOT_CONFIGURED" }, { status: 503, headers: gate.headers });
  }

  let body: CreateTaskRequest;
  try {
    body = (await req.json()) as CreateTaskRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400, headers: gate.headers });
  }

  const { subject, sender, dateReceived, snippet, alertType } = body;

  if (!subject || !dateReceived) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400, headers: gate.headers });
  }

  const taskName = buildTaskName(alertType || "Sanctions List", dateReceived);
  const taskNotes = buildTaskNotes(subject, sender, dateReceived, snippet);

  const payload = {
    data: {
      name: taskName,
      notes: taskNotes,
      projects: [ASANA_PROJECT_GID],
      assignee: ASANA_ASSIGNEE_GID,
      due_on: dueDateStr(dateReceived),
    },
  };

  try {
    const res = await fetch(`${ASANA_API_BASE}/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[tfs-create-task] Asana error:", res.status, errorText);
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json({ ok: false, error: "ASANA_AUTH_FAILED" }, { status: 401, headers: gate.headers });
      }
      return NextResponse.json(
        { ok: false, error: `Asana API error ${res.status}` },
        { status: 502, headers: gate.headers },
      );
    }

    const data = (await res.json()) as { data?: { gid?: string } };
    const taskId = data.data?.gid ?? "";
    const taskUrl = `https://app.asana.com/0/${ASANA_PROJECT_GID}/${taskId}`;

    return NextResponse.json({ ok: true, taskId, taskUrl } satisfies CreateTaskResponse, { headers: gate.headers });
  } catch (err) {
    console.error("[tfs-create-task] fetch failed:", err);
    return NextResponse.json({ ok: false, error: "NETWORK_ERROR" }, { status: 504, headers: gate.headers });
  }
}
