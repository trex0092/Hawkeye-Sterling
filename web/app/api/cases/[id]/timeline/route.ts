// GET /api/cases/[id]/timeline
//
// Returns a CaseTimeline-compatible event array for a given case,
// built from the case record's presentation-layer timeline + evidence +
// audit chain entries filtered to this caseId.
//
// Response: { ok, caseId, events: CaseTimelineEvent[] }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadCase } from "@/lib/server/case-vault";
import type { CaseTimelineEvent, CaseTimelineEventType } from "@/components/cases/CaseTimeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeIso(raw: unknown): string {
  if (typeof raw === "string" && raw.length > 0) return raw;
  return new Date().toISOString();
}

function eventTypeFromText(text: string): CaseTimelineEventType {
  const t = text.toLowerCase();
  if (/screen|match|hit/.test(t))              return "screening";
  if (/escalat|four.?eyes|mlro/.test(t))       return "escalation";
  if (/str|sar|filed|report/.test(t))          return "str_filed";
  if (/doc|evidence|attach|upload/.test(t))    return "document";
  if (/dispos|verdict|cleared|approve/.test(t)) return "disposition";
  if (/creat|open|start|init/.test(t))         return "created";
  if (/close|clos|end|exit/.test(t))           return "closed";
  return "note";
}

function severityFromText(text: string): CaseTimelineEvent["severity"] {
  const t = text.toLowerCase();
  if (/critical|str|sar|sanction|escalat|prohibit/.test(t)) return "critical";
  if (/warning|high|flag|suspect|pep/.test(t))               return "warning";
  return "info";
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const tenant = tenantIdFromGate(gate);
  const { id: caseId } = await ctx.params;

  if (!caseId || typeof caseId !== "string") {
    return NextResponse.json({ ok: false, error: "caseId required" }, { status: 400 });
  }

  const found = await loadCase(tenant, caseId);
  if (!found) {
    return NextResponse.json({ ok: false, error: "case not found" }, { status: 404 });
  }

  const events: CaseTimelineEvent[] = [];
  let seq = 0;

  // 1. Case created event
  events.push({
    id: `${caseId}-created`,
    timestamp: safeIso(found.opened),
    actor: "system",
    eventType: "created",
    title: `Case ${caseId} opened`,
    detail: found.subject ? `Subject: ${found.subject}` : undefined,
    severity: "info",
  });

  // 2. Map presentation-layer timeline entries
  for (const entry of found.timeline ?? []) {
    seq += 1;
    const eventType = eventTypeFromText(entry.event ?? "");
    events.push({
      id: `${caseId}-timeline-${seq}`,
      timestamp: safeIso(entry.timestamp),
      actor: "analyst",
      eventType,
      title: entry.event,
      severity: severityFromText(entry.event ?? ""),
    });
  }

  // 3. Map evidence entries as document events
  for (const ev of found.evidence ?? []) {
    seq += 1;
    events.push({
      id: `${caseId}-evidence-${seq}`,
      timestamp: safeIso(found.opened),
      actor: "analyst",
      eventType: "document",
      title: ev.title ?? `${ev.category ?? "document"} evidence`,
      detail: ev.detail ?? undefined,
      severity: "info",
    });
  }

  // 4. Closed event if status indicates it
  if (found.status === "closed" || found.status === "reported") {
    const closedAt = found.reported ?? found.lastActivity ?? found.opened;
    events.push({
      id: `${caseId}-closed`,
      timestamp: safeIso(closedAt),
      actor: "system",
      eventType: found.status === "reported" ? "str_filed" : "closed",
      title: found.status === "reported"
        ? `STR/SAR filed${found.goAMLReference ? ` — GoAML ref: ${found.goAMLReference}` : ""}`
        : `Case closed`,
      severity: found.status === "reported" ? "critical" : "info",
    });
  }

  // Sort by timestamp descending (newest first)
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json(
    { ok: true, caseId, events },
    { headers: gate.headers },
  );
}
