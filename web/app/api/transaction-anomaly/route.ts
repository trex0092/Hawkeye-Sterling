import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { detectAnomalies } from "../../../../dist/src/integrations/osintBridge.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface TransactionFeature {
  amount: number;
  hour?: number;
  dayOfWeek?: number;
  counterpartyCount?: number;
  [key: string]: number | undefined;
}

interface Body {
  transactions: TransactionFeature[];
  algorithm?: "isolation_forest" | "lof" | "zscore";
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  if (!Array.isArray(body?.transactions) || body.transactions.length === 0) {
    return NextResponse.json({ ok: false, error: "transactions must be a non-empty array" }, { status: 400, headers: CORS });
  }
  if (body.transactions.length > 5_000) {
    return NextResponse.json({ ok: false, error: "max 5,000 transactions per request" }, { status: 400, headers: CORS });
  }

  const algorithm = body.algorithm ?? "isolation_forest";
  // Extract numeric feature vectors from transactions
  const features = body.transactions.map((t) =>
    Object.values(t).filter((v): v is number => typeof v === "number"),
  );

  try {
    const result = await detectAnomalies(features, algorithm, {});
    const anomalyCount = result.outliers?.length ?? 0;
    const flagged = result.outliers?.map((idx: number) => body.transactions[idx]).filter(Boolean) ?? [];

    return NextResponse.json({
      ok: true,
      algorithm,
      total: body.transactions.length,
      anomalyCount,
      anomalyRate: body.transactions.length > 0 ? anomalyCount / body.transactions.length : 0,
      flagged,
      scores: result.scores ?? [],
      analysedAt: new Date().toISOString(),
    }, { headers: { ...CORS, ...gateHeaders } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("not configured") || msg.toLowerCase().includes("econnrefused")) {
      return NextResponse.json(
        { ok: false, error: "Anomaly detection service not configured" },
        { status: 503, headers: CORS },
      );
    }
    return NextResponse.json({ ok: false, error: "anomaly detection failed", detail: msg }, { status: 502, headers: CORS });
  }
}
