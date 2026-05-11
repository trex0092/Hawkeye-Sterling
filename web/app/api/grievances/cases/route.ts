import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Grievance cases are stored in Netlify Blobs under the key
// "hawkeye-grievances" / "cases.json". When the store is unavailable
// (local dev without Netlify context) the route returns an empty list
// rather than fabricated data.

interface GrievanceCase {
  id: string;
  receivedAt: string;
  channel: string;
  category: string;
  categoryVariant: string;
  stage: string;
  stageStatus: string;
  slaPct: number;
  slaVariant: string;
  owner: string;
}

async function loadCasesFromStore(): Promise<GrievanceCase[]> {
  try {
    // Dynamic import so builds without Netlify context don't hard-fail.
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("hawkeye-grievances");
    const raw = await store.get("cases.json", { type: "text" });
    if (!raw) return [];
    return JSON.parse(raw) as GrievanceCase[];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const statusFilter = searchParams.get("status");

  const allCases = await loadCasesFromStore();
  const filtered = statusFilter
    ? allCases.filter((c) => c.stageStatus === statusFilter)
    : allCases;
  const cases = filtered.slice(0, limit);

  return NextResponse.json({ cases, total: filtered.length }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  let body: Partial<GrievanceCase>;
  try {
    body = (await req.json()) as Partial<GrievanceCase>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.category || !body.channel) {
    return NextResponse.json({ error: "category and channel are required" }, { status: 400 });
  }

  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("hawkeye-grievances");
    const existing = await loadCasesFromStore();

    // Generate sequential case ID in the FG-WB-YYYY-NNN format.
    const year = new Date().getFullYear();
    const lastNum = existing
      .map((c) => parseInt(c.id.split("-").pop() ?? "0", 10))
      .reduce((max, n) => Math.max(max, n), 0);
    const newNum = String(lastNum + 1).padStart(3, "0");
    const newId = `FG-WB-${year}-${newNum}`;

    const newCase: GrievanceCase = {
      id: newId,
      receivedAt: new Date().toISOString(),
      channel: body.channel,
      category: body.category,
      categoryVariant: body.categoryVariant ?? "ops",
      stage: body.stage ?? "Investigation",
      stageStatus: body.stageStatus ?? "open",
      slaPct: body.slaPct ?? 0,
      slaVariant: body.slaVariant ?? "ok",
      owner: body.owner ?? "MLRO",
    };

    await store.set("cases.json", JSON.stringify([newCase, ...existing]));
    return NextResponse.json({ ok: true, case: newCase }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: `store unavailable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 503 },
    );
  }
}
