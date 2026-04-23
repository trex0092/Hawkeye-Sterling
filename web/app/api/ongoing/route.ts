import { NextResponse } from "next/server";
import { del, getJson, listKeys, setJson } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EnrolledSubject {
  id: string;
  name: string;
  aliases?: string[];
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  group?: string;
  caseId?: string;
  enrolledAt: string;
}

// GET /api/ongoing — list all enrolled subjects
export async function GET(): Promise<NextResponse> {
  const keys = await listKeys("ongoing/subject/");
  const subjects: EnrolledSubject[] = [];
  for (const key of keys) {
    const s = await getJson<EnrolledSubject>(key);
    if (s) subjects.push(s);
  }
  return NextResponse.json({ ok: true, count: subjects.length, subjects });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringField(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function stringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const cleaned = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

// POST /api/ongoing — enroll a subject for ongoing screening
export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!isRecord(raw)) {
    return NextResponse.json(
      { ok: false, error: "body must be a JSON object" },
      { status: 400 },
    );
  }
  const id = stringField(raw["id"]);
  const name = stringField(raw["name"]);
  if (!id || !name) {
    return NextResponse.json(
      { ok: false, error: "id and name required" },
      { status: 400 },
    );
  }
  const entityTypeRaw = stringField(raw["entityType"]);
  const allowedEntityTypes = new Set([
    "individual",
    "organisation",
    "vessel",
    "aircraft",
    "other",
  ]);
  const entityType =
    entityTypeRaw && allowedEntityTypes.has(entityTypeRaw)
      ? (entityTypeRaw as EnrolledSubject["entityType"])
      : undefined;
  const record: EnrolledSubject = {
    id,
    name,
    ...(stringArray(raw["aliases"]) ? { aliases: stringArray(raw["aliases"])! } : {}),
    ...(entityType ? { entityType } : {}),
    ...(stringField(raw["jurisdiction"]) ? { jurisdiction: stringField(raw["jurisdiction"])! } : {}),
    ...(stringField(raw["group"]) ? { group: stringField(raw["group"])! } : {}),
    ...(stringField(raw["caseId"]) ? { caseId: stringField(raw["caseId"])! } : {}),
    enrolledAt: new Date().toISOString(),
  };
  await setJson(`ongoing/subject/${id}`, record);
  return NextResponse.json({ ok: true, subject: record });
}

// DELETE /api/ongoing?id=HS-10001
export async function DELETE(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }
  await del(`ongoing/subject/${id}`);
  await del(`ongoing/last/${id}`);
  return NextResponse.json({ ok: true });
}
