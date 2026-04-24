import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { postWebhook } from "@/lib/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dedicated endpoint for Transaction-Monitor compliance reports. Files
// one Asana task per transaction into ASANA_TM_PROJECT_GID (separate
// board from screening / STR / escalations so the TM queue stays
// focused). Mirrors the shape of /api/sar-report but with a transaction-
// centric notes body.
const DEFAULT_WORKSPACE_GID = "1213645083721316";
const DEFAULT_ASSIGNEE_GID = "1213645083721304";

interface Body {
  transaction: {
    ref: string;
    counterparty: string;
    counterpartyCountry?: string;
    amount: string;
    currency: string;
    occurredOn?: string;
    channel: string;
    direction: string;
    behaviouralFlags?: string[];
    notes?: string;
    loggedAt: string;
  };
}

async function handleTmReport(req: Request): Promise<NextResponse> {
  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: "asana_not_configured",
        detail: "Set ASANA_TOKEN in Netlify env for hawkeye-sterling.",
      },
      { status: 503 },
    );
  }
  const projectGid = process.env["ASANA_TM_PROJECT_GID"];
  if (!projectGid) {
    return NextResponse.json(
      {
        ok: false,
        error: "asana_not_configured",
        detail: "Set ASANA_TM_PROJECT_GID in Netlify env for the Transaction Monitor board.",
      },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const t = body?.transaction;
  if (!t?.ref || !t?.counterparty || !t?.amount) {
    return NextResponse.json(
      { ok: false, error: "transaction.ref, counterparty and amount are required" },
      { status: 400 },
    );
  }

  const flagged = (t.behaviouralFlags ?? []).length > 0;
  const amountNum = Number.parseFloat(t.amount.replace(/,/g, "")) || 0;
  const reportableCash =
    /cash/i.test(t.channel) && amountNum >= 55_000;
  const severity = reportableCash
    ? "REPORTABLE"
    : flagged
      ? "FLAGGED"
      : "ROUTINE";
  const name = `[TM · ${severity}] ${t.counterparty} · ${t.currency} ${t.amount} · ${t.ref}`;

  const lines: string[] = [];
  lines.push(`HAWKEYE STERLING · TRANSACTION-MONITOR FILING`);
  lines.push(`Transaction ref   : ${t.ref}`);
  lines.push(`Counterparty      : ${t.counterparty}`);
  if (t.counterpartyCountry)
    lines.push(`Counterparty ctry : ${t.counterpartyCountry}`);
  lines.push(`Amount            : ${t.currency} ${t.amount}`);
  lines.push(`Channel           : ${t.channel}`);
  lines.push(`Direction         : ${t.direction}`);
  if (t.occurredOn) lines.push(`Occurred on       : ${t.occurredOn}`);
  lines.push(`Logged            : ${t.loggedAt}`);
  lines.push("");
  lines.push(`── ASSESSMENT ──`);
  lines.push(`Severity          : ${severity}`);
  if (reportableCash) {
    lines.push(
      `DPMSR trigger     : cash component ≥ AED 55,000 (MoE Circular 2/2024).`,
    );
  }
  if (flagged) {
    lines.push(`Behavioural flags : ${(t.behaviouralFlags ?? []).join(", ")}`);
  }
  if (t.notes) {
    lines.push("");
    lines.push(`── ANALYST NOTES ──`);
    lines.push(t.notes);
  }
  lines.push("");
  lines.push(`── ACTIONS ──`);
  if (reportableCash) {
    lines.push(`[ ] File DPMSR via goAML  [ ] Block relationship  [ ] Escalate to MLRO`);
  } else if (flagged) {
    lines.push(`[ ] Acknowledge  [ ] Open enquiry  [ ] Escalate to MLRO`);
  } else {
    lines.push(`[ ] Acknowledge  [ ] Archive`);
  }
  lines.push("");
  lines.push(
    `Hawkeye           : https://hawkeye-sterling.netlify.app/transaction-monitor`,
  );
  lines.push(
    `Legal basis       : FDL 10/2025 · CR 134/2025 · MoE Circular 2/2024 (DPMS)`,
  );

  let taskRes: Response;
  let payload:
    | { data?: { gid?: string; permalink_url?: string }; errors?: { message?: string }[] }
    | null;
  try {
    taskRes = await fetch("https://app.asana.com/api/1.0/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          name,
          notes: lines.join("\n"),
          projects: [projectGid],
          workspace: process.env["ASANA_WORKSPACE_GID"] ?? DEFAULT_WORKSPACE_GID,
          assignee: process.env["ASANA_ASSIGNEE_GID"] ?? DEFAULT_ASSIGNEE_GID,
        },
      }),
    });
    payload = (await taskRes.json().catch(() => null)) as typeof payload;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "asana request failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
  if (!taskRes.ok || !payload?.data?.gid) {
    const upstreamStatus = taskRes.status;
    const mappedStatus =
      upstreamStatus >= 500
        ? 502
        : upstreamStatus === 401 || upstreamStatus === 403
          ? 503
          : 422;
    return NextResponse.json(
      {
        ok: false,
        error: "asana rejected the filing",
        detail: payload?.errors?.[0]?.message ?? `HTTP ${upstreamStatus}`,
      },
      { status: mappedStatus },
    );
  }

  void postWebhook({
    type: "tm.filed",
    subjectId: t.ref,
    subjectName: t.counterparty,
    severity,
    ...(payload.data.permalink_url ? { asanaTaskUrl: payload.data.permalink_url } : {}),
    generatedAt: t.loggedAt,
    source: "hawkeye-sterling",
  }).catch((err) => console.error("[tm-report] webhook failed", err));

  return NextResponse.json(
    {
      ok: true,
      taskGid: payload.data.gid,
      ...(payload.data.permalink_url ? { taskUrl: payload.data.permalink_url } : {}),
    },
    { status: 201 },
  );
}

export const POST = withGuard(handleTmReport);
