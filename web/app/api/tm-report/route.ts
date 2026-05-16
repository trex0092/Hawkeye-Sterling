import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { postWebhook } from "@/lib/server/webhook";

import { getAnthropicClient } from "@/lib/server/llm";
import { asanaGids } from "@/lib/server/asanaConfig";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

interface TypologyResult {
  typologies: string[];
  narrative: string;
  severityUpgrade: boolean;
  regulatoryBasis: string;
}

async function classifyTransaction(
  ref: string,
  counterparty: string,
  counterpartyCountry: string | undefined,
  amount: string,
  currency: string,
  channel: string,
  direction: string,
  behaviouralFlags: string[],
  notes: string | undefined,
): Promise<TypologyResult | null> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return null;

  const userContent = [
    `Transaction ref: ${sanitizeField(ref, 200)}`,
    `Counterparty: ${sanitizeField(counterparty, 500)}`,
    counterpartyCountry ? `Counterparty country: ${sanitizeField(counterpartyCountry, 100)}` : null,
    `Amount: ${sanitizeField(currency, 10)} ${sanitizeField(amount, 50)}`,
    `Channel: ${sanitizeField(channel, 100)}`,
    `Direction: ${sanitizeField(direction, 50)}`,
    behaviouralFlags.length > 0 ? `Behavioural flags: ${behaviouralFlags.map((f) => sanitizeField(f, 200)).join(", ")}` : null,
    notes ? `Notes: ${sanitizeField(notes, 2000)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const client = getAnthropicClient(apiKey, 4_500);
  const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system:
        'You are a UAE-licensed AML typology classifier for a DPMS compliance platform. Analyze a transaction and return ONLY this JSON: { "typologies": ["string"], "narrative": "string", "severityUpgrade": boolean, "regulatoryBasis": "string" }. typologies = FATF ML/TF typology codes (e.g. \'ML-TF-01 Structuring\', \'ML-TF-09 Cash-intensive business\'). narrative = 1-2 sentence STR-ready description. severityUpgrade = true if you\'d recommend escalating severity. regulatoryBasis = specific UAE/FATF articles triggered.',
      messages: [{ role: "user", content: userContent }],
    });


  const text = res.content[0]?.type === "text" ? res.content[0].text : "";

  // Strip markdown fences before parsing
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    const result = JSON.parse(stripped) as TypologyResult;
    // Normalize — LLM occasionally returns null instead of [].
    if (!Array.isArray(result.typologies)) result.typologies = [];
    return result;
  } catch {
    return null;
  }
}

async function handleTmReport(req: Request): Promise<NextResponse> {
  const token = process.env["ASANA_TOKEN"];
  const projectGid = asanaGids.tm();
  const asanaEnabled = !!token && !!projectGid;

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
  let severity: "ROUTINE" | "FLAGGED" | "REPORTABLE" = reportableCash
    ? "REPORTABLE"
    : flagged
      ? "FLAGGED"
      : "ROUTINE";

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

  // AI typology classification — fire before Asana filing, graceful degradation
  let typologyResult: TypologyResult | null = null;
  try {
    typologyResult = await classifyTransaction(
      t.ref,
      t.counterparty,
      t.counterpartyCountry,
      t.amount,
      t.currency,
      t.channel,
      t.direction,
      t.behaviouralFlags ?? [],
      t.notes,
    );
  } catch (err) {
    console.warn("[tm-report] typology classification failed — proceeding without enrichment:", err instanceof Error ? err.message : String(err));
  }

  if (typologyResult) {
    // Severity upgrade logic
    if (typologyResult.severityUpgrade) {
      if (severity === "ROUTINE") {
        severity = "FLAGGED";
        lines.push(`Severity upgrade recommended by AI classifier`);
      } else if (severity === "FLAGGED") {
        severity = "REPORTABLE";
        lines.push(`Severity upgrade recommended by AI classifier`);
      }
    }

    lines.push("");
    lines.push(`── AI TYPOLOGY ANALYSIS ──`);
    lines.push(
      `Typologies : ${typologyResult.typologies.join(" · ")}`,
    );
    lines.push(`Narrative  : ${typologyResult.narrative}`);
    lines.push(`Regulatory : ${typologyResult.regulatoryBasis}`);
  }

  // Build task name — include first typology code if available
  const firstTypology = typologyResult?.typologies?.[0];
  const name = firstTypology
    ? `[TM · ${severity} · ${firstTypology}] ${t.counterparty} · ${t.currency} ${t.amount} · ${t.ref}`
    : `[TM · ${severity}] ${t.counterparty} · ${t.currency} ${t.amount} · ${t.ref}`;

  lines.push("");
  lines.push(`── ACTIONS ──`);
  if (severity === "REPORTABLE") {
    lines.push(`[ ] File DPMSR via goAML  [ ] Block relationship  [ ] Escalate to MLRO`);
  } else if (severity === "FLAGGED") {
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

  if (!asanaEnabled) {
    return NextResponse.json({
      ok: true,
      asanaSkipped: true,
      asanaNote: "ASANA_TOKEN not configured — report generated but not filed to MLRO inbox.",
      reportText: lines.join("\n"),
    });
  }

  let taskRes: Response;
  let payload:
    | { data?: { gid?: string; permalink_url?: string }; errors?: { message?: string }[] }
    | null;
  try {
    taskRes = await fetch("https://app.asana.com/api/1.0/tasks", {
      signal: AbortSignal.timeout(10_000),
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
          workspace: asanaGids.workspace(),
          assignee: asanaGids.assignee(),
        },
      }),
    });
    payload = (await taskRes.json().catch((err: unknown) => {
      console.warn("[hawkeye] tm-report Asana response parse failed:", err);
      return null;
    })) as typeof payload;
  } catch (err) {
    return NextResponse.json({
      ok: true,
      asanaSkipped: true,
      asanaNote: `Asana request failed: ${err instanceof Error ? err.message : String(err)}. Report generated successfully.`,
      reportText: lines.join("\n"),
    });
  }
  if (!taskRes.ok || !payload?.data?.gid) {
    return NextResponse.json({
      ok: true,
      asanaSkipped: true,
      asanaNote: `Asana rejected the filing (HTTP ${taskRes.status}). Report generated successfully.`,
      reportText: lines.join("\n"),
    });
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
