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

// POST /api/ongoing — enroll a subject for ongoing screening
export async function POST(req: Request): Promise<NextResponse> {
  let body: Partial<EnrolledSubject>;
  try {
    body = (await req.json()) as Partial<EnrolledSubject>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!body?.id || !body?.name) {
    return NextResponse.json(
      { ok: false, error: "id and name required" },
      { status: 400 },
    );
  }
  const record: EnrolledSubject = {
    id: body.id,
    name: body.name,
    ...(body.aliases ? { aliases: body.aliases } : {}),
    ...(body.entityType ? { entityType: body.entityType } : {}),
    ...(body.jurisdiction ? { jurisdiction: body.jurisdiction } : {}),
    ...(body.group ? { group: body.group } : {}),
    ...(body.caseId ? { caseId: body.caseId } : {}),
    enrolledAt: new Date().toISOString(),
  };
  await setJson(`ongoing/subject/${body.id}`, record);
  return NextResponse.json({ ok: true, subject: record });
}

// DELETE /api/ongoing?id=HS-10001
export async function DELETE(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }
  await del(`ongoing/subject/${id}`);
  await del(`ongoing/last/${id}`);
  return NextResponse.json({ ok: true });
}
