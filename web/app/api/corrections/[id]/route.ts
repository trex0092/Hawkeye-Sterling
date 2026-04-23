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

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const record = await getJson<CorrectionRequest>(`${PREFIX}${params.id}`);
  if (!record) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  if (body.status) {
    record.status = body.status;
    if (
      body.status === "correction_applied" ||
      body.status === "record_retained"
    ) {
      record.resolvedAt = new Date().toISOString();
    }
  }
  if (body.resolutionNote) record.resolutionNote = body.resolutionNote;
  if (body.appeal) {
    record.status = "escalated";
    record.reason = `Appeal filed by ${body.appeal.by}: ${body.appeal.reason}`;
  }
  await setJson(`${PREFIX}${params.id}`, record);
  return NextResponse.json({ ok: true, request: record });
}
