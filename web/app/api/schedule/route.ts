import { NextResponse } from "next/server";
import { getJson, listKeys, setJson, del } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-subject rescreening cadence. The scheduled Netlify Function reads
// this table on every tick and only re-runs subjects whose nextRunAt
// has elapsed. Cadences supported: hourly, daily, weekly, monthly.

type Cadence = "hourly" | "daily" | "weekly" | "monthly";

const CADENCE_MS: Record<Cadence, number> = {
  hourly: 60 * 60 * 1_000,
  daily: 24 * 60 * 60 * 1_000,
  weekly: 7 * 24 * 60 * 60 * 1_000,
  monthly: 30 * 24 * 60 * 60 * 1_000,
};

interface Schedule {
  subjectId: string;
  cadence: Cadence;
  scoreThreshold?: number;
  createdAt: string;
  nextRunAt: string;
  lastRunAt?: string;
}

const PREFIX = "schedule/";

export async function GET(): Promise<NextResponse> {
  const keys = await listKeys(PREFIX);
  const out: Schedule[] = [];
  for (const k of keys) {
    const s = await getJson<Schedule>(k);
    if (s) out.push(s);
  }
  return NextResponse.json({ ok: true, count: out.length, schedules: out });
}

interface UpsertBody {
  subjectId?: string;
  cadence?: Cadence;
  scoreThreshold?: number;
}

const VALID_CADENCES: readonly Cadence[] = ["hourly", "daily", "weekly", "monthly"];

function isCadence(v: unknown): v is Cadence {
  return typeof v === "string" && (VALID_CADENCES as readonly string[]).includes(v);
}

export async function POST(req: Request): Promise<NextResponse> {
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
  const subjectId =
    typeof body["subjectId"] === "string" && body["subjectId"].trim()
      ? body["subjectId"].trim()
      : undefined;
  const cadenceRaw = body["cadence"];
  const scoreThreshold =
    typeof body["scoreThreshold"] === "number" ? body["scoreThreshold"] : undefined;

  if (!subjectId || !isCadence(cadenceRaw)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "subjectId required; cadence must be hourly | daily | weekly | monthly",
      },
      { status: 400 },
    );
  }
  const cadence: Cadence = cadenceRaw;
  if (
    scoreThreshold !== undefined &&
    (scoreThreshold < 0 || scoreThreshold > 1)
  ) {
    return NextResponse.json(
      { ok: false, error: "scoreThreshold must be between 0 and 1" },
      { status: 400 },
    );
  }
  const now = new Date();
  const record: Schedule = {
    subjectId,
    cadence,
    ...(scoreThreshold !== undefined ? { scoreThreshold } : {}),
    createdAt: now.toISOString(),
    nextRunAt: new Date(now.getTime() + CADENCE_MS[cadence]).toISOString(),
  };
  await setJson(`${PREFIX}${subjectId}`, record);
  return NextResponse.json({ ok: true, schedule: record });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = url.searchParams.get("subjectId");
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "subjectId required" },
      { status: 400 },
    );
  }
  await del(`${PREFIX}${id}`);
  return NextResponse.json({ ok: true });
}
