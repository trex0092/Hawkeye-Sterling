import { NextResponse } from "next/server";
import { getJson, listKeys, setJson, del } from "@/lib/server/store";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-subject rescreening cadence. The scheduled Netlify Function reads
// this table on every tick and only re-runs subjects whose nextRunAt
// has elapsed. Cadences supported: thrice_daily (default), hourly, daily, weekly, monthly.

type Cadence = "thrice_daily" | "hourly" | "daily" | "weekly" | "monthly";

// 08:30 / 15:00 / 17:30 Dubai (UTC+4, no DST) → 04:30 / 11:00 / 13:30 UTC.
const THRICE_DAILY_SLOTS_UTC: Array<[number, number]> = [
  [4, 30],
  [11, 0],
  [13, 30],
];

function nextThriceDailyRun(from: Date): Date {
  const candidates = THRICE_DAILY_SLOTS_UTC.map(([h, m]) => {
    const d = new Date(from);
    d.setUTCHours(h, m, 0, 0);
    if (d.getTime() <= from.getTime()) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  });
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0]!;
}

const CADENCE_MS: Record<Exclude<Cadence, "thrice_daily">, number> = {
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

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const keys = await listKeys(PREFIX);
  const out: Schedule[] = [];
  for (const k of keys) {
    const s = await getJson<Schedule>(k);
    if (s) out.push(s);
  }
  return NextResponse.json({ ok: true, count: out.length, schedules: out }, { headers: gate.headers });
}

interface UpsertBody {
  subjectId?: string;
  cadence?: Cadence; // thrice_daily is the default for compliance monitoring
  scoreThreshold?: number;
}

const VALID_CADENCES: readonly Cadence[] = ["thrice_daily", "hourly", "daily", "weekly", "monthly"];

function isCadence(v: unknown): v is Cadence {
  return typeof v === "string" && (VALID_CADENCES as readonly string[]).includes(v);
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const gateHeaders = gate.headers;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gateHeaders });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json(
      { ok: false, error: "body must be a JSON object" },
      { status: 400, headers: gateHeaders },
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
          "subjectId required; cadence must be thrice_daily | hourly | daily | weekly | monthly",
      },
      { status: 400, headers: gateHeaders },
    );
  }
  const cadence: Cadence = cadenceRaw;
  if (
    scoreThreshold !== undefined &&
    (scoreThreshold < 0 || scoreThreshold > 1)
  ) {
    return NextResponse.json(
      { ok: false, error: "scoreThreshold must be between 0 and 1" },
      { status: 400, headers: gateHeaders },
    );
  }
  const now = new Date();
  const nextRunAt =
    cadence === "thrice_daily"
      ? nextThriceDailyRun(now).toISOString()
      : new Date(now.getTime() + CADENCE_MS[cadence]).toISOString();
  const record: Schedule = {
    subjectId,
    cadence,
    ...(scoreThreshold !== undefined ? { scoreThreshold } : {}),
    createdAt: now.toISOString(),
    nextRunAt,
  };
  await setJson(`${PREFIX}${subjectId}`, record);
  return NextResponse.json({ ok: true, schedule: record }, { headers: gate.headers });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const id = url.searchParams.get("subjectId");
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "subjectId required" },
      { status: 400, headers: gate.headers },
    );
  }
  await del(`${PREFIX}${id}`);
  return NextResponse.json({ ok: true }, { headers: gate.headers });
}
