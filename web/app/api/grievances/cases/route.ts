import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MOCK_CASES = [
  { id: "FG-WB-2026-014", receivedAt: "2026-05-02T09:14:00Z", channel: "EMAIL",   category: "AML/CFT",    categoryVariant: "aml",  stage: "Investigation",     stageStatus: "open",      slaPct: 36,  slaVariant: "warn",   owner: "MLRO" },
  { id: "FG-WB-2026-013", receivedAt: "2026-04-28T16:02:00Z", channel: "DIRECT",  category: "BRIBERY",    categoryVariant: "eth",  stage: "Decision",          stageStatus: "review",    slaPct: 88,  slaVariant: "ok",     owner: "CO"   },
  { id: "FG-WB-2026-012", receivedAt: "2026-04-22T11:48:00Z", channel: "WRITTEN", category: "HARASSMENT", categoryVariant: "hr",   stage: "Escalated · MD",    stageStatus: "escalated", slaPct: 94,  slaVariant: "danger", owner: "MD"   },
  { id: "FG-WB-2026-011", receivedAt: "2026-04-18T08:30:00Z", channel: "MEETING", category: "PROCESS",    categoryVariant: "ops",  stage: "Closed · resolved", stageStatus: "closed",    slaPct: 100, slaVariant: "ok",     owner: "CO"   },
  { id: "FG-WB-2026-010", receivedAt: "2026-04-11T14:21:00Z", channel: "EMAIL",   category: "SANCTIONS",  categoryVariant: "aml",  stage: "Closed · STR filed",stageStatus: "closed",    slaPct: 100, slaVariant: "ok",     owner: "MLRO" },
  { id: "FG-WB-2026-009", receivedAt: "2026-04-04T10:55:00Z", channel: "EMAIL",   category: "CONFLICT",   categoryVariant: "eth",  stage: "Closed · coaching", stageStatus: "closed",    slaPct: 100, slaVariant: "ok",     owner: "CO"   },
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const cases = MOCK_CASES.slice(0, limit);
  return NextResponse.json({ cases, total: MOCK_CASES.length }, {
    headers: { "Cache-Control": "no-store" },
  });
}
