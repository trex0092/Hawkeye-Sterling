// POST /api/comtrade-query
//
// Next.js API route that proxies the UN Comtrade public preview endpoint.
// No API key required — uses the free preview endpoint.
// Validates input, adds timeout, and returns structured JSON.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";

const COMTRADE_BASE_URL =
  process.env["COMTRADE_BASE_URL"] ?? "https://comtradeapi.un.org/public/v1/preview";

interface RequestBody {
  reporterCode: number | string;
  cmdCode: string;
  flowCode: string;
  period: string;
  partnerCode?: number | string;
}

interface ValidationError {
  field: string;
  message: string;
}

function validateBody(
  raw: unknown,
): { ok: true; value: RequestBody } | { ok: false; errors: ValidationError[] } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: [{ field: "body", message: "Request body must be a JSON object" }] };
  }
  const b = raw as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (b["reporterCode"] === undefined || b["reporterCode"] === null || b["reporterCode"] === "") {
    errors.push({ field: "reporterCode", message: "reporterCode is required" });
  }
  if (typeof b["cmdCode"] !== "string" || !b["cmdCode"].trim()) {
    errors.push({ field: "cmdCode", message: "cmdCode is required" });
  }
  if (typeof b["flowCode"] !== "string" || !b["flowCode"].trim()) {
    errors.push({ field: "flowCode", message: "flowCode is required" });
  }
  if (typeof b["period"] !== "string" || !b["period"].trim()) {
    errors.push({ field: "period", message: "period is required" });
  }
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      reporterCode: b["reporterCode"] as number | string,
      cmdCode: (b["cmdCode"] as string).trim(),
      flowCode: (b["flowCode"] as string).trim(),
      period: (b["period"] as string).trim(),
      partnerCode: b["partnerCode"] as number | string | undefined,
    },
  };
}

interface ComtradeApiResponse {
  count: number | null;
  data: unknown[] | null;
  error: string | null;
}

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = validateBody(raw);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, errors: validated.errors }, { status: 400 });
  }

  const { reporterCode, cmdCode, flowCode, period, partnerCode } = validated.value;

  const params = new URLSearchParams({
    reporterCode: String(reporterCode),
    cmdCode,
    flowCode,
    period,
    maxRecords: "500",
    includeDesc: "true",
  });
  if (partnerCode !== undefined && partnerCode !== null && String(partnerCode) !== "") {
    params.set("partnerCode", String(partnerCode));
  }

  const url = `${COMTRADE_BASE_URL}/C/A/HS?${params.toString()}`;

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20_000);
    let apiRes: Response;
    try {
      apiRes = await fetch(url, {
        signal: ctl.signal,
        headers: { accept: "application/json" },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: `Comtrade API returned HTTP ${apiRes.status}`,
          detail: errText.slice(0, 200),
        },
        { status: 502 },
      );
    }

    const apiData = await apiRes.json() as ComtradeApiResponse;
    return NextResponse.json({ ok: true, count: apiData.count ?? 0, data: apiData.data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: `Comtrade fetch failed — ${msg}` },
      { status: 502 },
    );
  }
}
