import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Aircraft {
  registration: string;
  type: string;
  jurisdiction: string;
}

interface ReqBody {
  subjectName: string;
  tailNumber?: string;
}

function hashStr(s: string): number {
  return s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

const AIRCRAFT_TYPES = ["Gulfstream G650", "Bombardier Global 7500", "Dassault Falcon 8X", "Cessna Citation X", "Embraer Legacy 650"];
const AIRCRAFT_JURISDICTIONS = ["UAE", "Isle of Man", "San Marino", "Aruba", "Malta", "Cayman Islands", "Marshall Islands"];
const SANCTIONED_AIRPORTS = [
  "DME — Domodedovo, Moscow (Russia)",
  "THR — Mehrabad, Tehran (Iran)",
  "PYO — Pyongyang Sunan (North Korea)",
  "BGW — Baghdad International (elevated risk)",
  "KHI — Karachi (FATF greylist jurisdiction)",
];
const AVIATION_FLAGS = [
  "Aircraft registered in low-oversight jurisdiction — opaque beneficial ownership",
  "Flight patterns inconsistent with declared business activities",
  "Aircraft used for undisclosed cross-border movements to sanctioned territories",
  "Tail number changed following sanctions listing of associated entity",
  "Wet lease arrangements obscure true operator identity",
  "Aircraft registered to shelf company with no employees",
];

export async function POST(req: Request): Promise<NextResponse> {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const { subjectName, tailNumber } = body;
  if (!subjectName) {
    return NextResponse.json({ ok: false, error: "subjectName is required" }, { status: 400 });
  }

  const hash = hashStr(subjectName);
  const aircraftCount = hash % 3;
  const aircraft: Aircraft[] = [];

  if (tailNumber) {
    aircraft.push({
      registration: tailNumber,
      type: AIRCRAFT_TYPES[hash % AIRCRAFT_TYPES.length],
      jurisdiction: AIRCRAFT_JURISDICTIONS[hash % AIRCRAFT_JURISDICTIONS.length],
    });
  }

  for (let i = 0; i < aircraftCount; i++) {
    const regPrefix = AIRCRAFT_JURISDICTIONS[(hash + i) % AIRCRAFT_JURISDICTIONS.length] === "UAE" ? "A6" : "VP";
    aircraft.push({
      registration: `${regPrefix}-${String.fromCharCode(65 + ((hash + i * 3) % 26))}${String.fromCharCode(65 + ((hash + i * 7) % 26))}${String.fromCharCode(65 + ((hash + i * 11) % 26))}`,
      type: AIRCRAFT_TYPES[(hash + i) % AIRCRAFT_TYPES.length],
      jurisdiction: AIRCRAFT_JURISDICTIONS[(hash + i) % AIRCRAFT_JURISDICTIONS.length],
    });
  }

  const sanctionedAirports: string[] = [];
  if (hash % 4 === 0) sanctionedAirports.push(SANCTIONED_AIRPORTS[0]);
  if (hash % 5 === 0) sanctionedAirports.push(SANCTIONED_AIRPORTS[1]);
  if (hash % 7 === 0) sanctionedAirports.push(SANCTIONED_AIRPORTS[2]);

  const flags: string[] = [];
  const flagCount = (hash % 3) + (aircraft.length > 0 ? 1 : 0);
  for (let i = 0; i < flagCount; i++) {
    flags.push(AVIATION_FLAGS[(hash + i) % AVIATION_FLAGS.length]);
  }

  const riskLevel = sanctionedAirports.length > 1 ? "HIGH"
    : sanctionedAirports.length > 0 || flags.length > 2 ? "MEDIUM"
    : aircraft.length > 0 ? "LOW" : "MINIMAL";

  return NextResponse.json({
    ok: true,
    aircraft,
    sanctionedAirports,
    flags,
    riskLevel,
  });
}
