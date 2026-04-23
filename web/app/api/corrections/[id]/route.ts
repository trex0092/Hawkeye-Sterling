import { NextResponse } from "next/server";
import { getJson, setJson } from "@/lib/server/store";
import type { CorrectionRequest, CorrectionStatus } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIX = "corrections/";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const record = await getJson<CorrectionRequest>(`${PREFIX}${params.id}`);
  if (!record) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, request: record });
}

interface PatchBody {
  status?: CorrectionStatus;
  resolutionNote?: string;
  appeal?: { by: string; reason: string };
}

const VALID_STATUSES: readonly CorrectionStatus[] = [
  "received",
  "under_review",
  "correction_applied",
  "record_retained",
  "escalated",
];

function isCorrectionStatus(v: unknown): v is CorrectionStatus {
  return typeof v === "string" && (VALID_STATUSES as readonly string[]).includes(v);
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json(
      { ok: false, error: "body must be a JSON object" },
      { status: 400 },
    );
  }
  const body = raw as Record<string, unknown>;

  // Validate status against the enum before writing — an unknown
  // status string would silently corrupt the record and later break
  // the correction-portal filter UI.
  if (body["status"] !== undefined && !isCorrectionStatus(body["status"])) {
    return NextResponse.json(
      {
        ok: false,
        error: `invalid status; must be one of: ${VALID_STATUSES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const record = await getJson<CorrectionRequest>(`${PREFIX}${params.id}`);
  if (!record) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const nextStatus = body["status"] as CorrectionStatus | undefined;
  if (nextStatus) {
    record.status = nextStatus;
    if (nextStatus === "correction_applied" || nextStatus === "record_retained") {
      record.resolvedAt = new Date().toISOString();
    }
  }

  if (typeof body["resolutionNote"] === "string") {
    record.resolutionNote = body["resolutionNote"];
  }

  const appeal = body["appeal"];
  if (
    appeal &&
    typeof appeal === "object" &&
    !Array.isArray(appeal) &&
    typeof (appeal as Record<string, unknown>)["by"] === "string" &&
    typeof (appeal as Record<string, unknown>)["reason"] === "string"
  ) {
    const a = appeal as { by: string; reason: string };
    record.status = "escalated";
    record.reason = `Appeal filed by ${a.by}: ${a.reason}`;
  }

  await setJson(`${PREFIX}${params.id}`, record);
  return NextResponse.json({ ok: true, request: record });
}
