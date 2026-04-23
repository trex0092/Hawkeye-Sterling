import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
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

const MAX_NAME_LENGTH = 500;
const MAX_ID_LENGTH = 128;

async function handleGet(): Promise<NextResponse> {
  const keys = await listKeys("ongoing/subject/");
  const loaded = await Promise.all(keys.map((k) => getJson<EnrolledSubject>(k)));
  const subjects = loaded.filter((s): s is EnrolledSubject => s !== null);
  return NextResponse.json({ ok: true, count: subjects.length, subjects });
}

async function handlePost(req: Request): Promise<NextResponse> {
  let body: Partial<EnrolledSubject>;
  try {
    body = (await req.json()) as Partial<EnrolledSubject>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!body?.id || typeof body.id !== "string" || body.id.length > MAX_ID_LENGTH) {
    return NextResponse.json({ ok: false, error: "id required (string, max 128 chars)" }, { status: 400 });
  }
  if (!body?.name || typeof body.name !== "string" || !body.name.trim() || body.name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ ok: false, error: "name required (string, max 500 chars)" }, { status: 400 });
  }
  // Sanitize aliases — drop non-string elements.
  const aliases = Array.isArray(body.aliases)
    ? (body.aliases as unknown[]).filter((a): a is string => typeof a === "string")
    : undefined;
  const record: EnrolledSubject = {
    id: body.id,
    name: body.name.trim(),
    ...(aliases && aliases.length ? { aliases } : {}),
    ...(body.entityType ? { entityType: body.entityType } : {}),
    ...(body.jurisdiction ? { jurisdiction: body.jurisdiction } : {}),
    ...(body.group ? { group: body.group } : {}),
    ...(body.caseId ? { caseId: body.caseId } : {}),
    enrolledAt: new Date().toISOString(),
  };
  await setJson(`ongoing/subject/${body.id}`, record);
  return NextResponse.json({ ok: true, subject: record });
}

async function handleDelete(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id || id.length > MAX_ID_LENGTH) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }
  await del(`ongoing/subject/${id}`);
  await del(`ongoing/last/${id}`);
  return NextResponse.json({ ok: true });
}

export const GET = withGuard(handleGet);
export const POST = withGuard(handlePost);
export const DELETE = withGuard(handleDelete);
