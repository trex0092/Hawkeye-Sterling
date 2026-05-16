import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  subjectName: string;
}

const GAMING_JURISDICTIONS = ["Malta", "Gibraltar", "Isle of Man", "Alderney", "Curaçao", "Kahnawake", "Antigua", "Belize"];
const CASINO_LICENCE_TYPES = [
  "Malta Gaming Authority (MGA) Category 2",
  "Gibraltar Remote Gambling Licence",
  "Isle of Man Online Gambling Licence",
  "UK Gambling Commission Remote Licence",
  "Curaçao eGaming Licence",
];

function hashStr(s: string): number {
  return s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const { subjectName } = body;
  if (!subjectName) {
    return NextResponse.json({ ok: false, error: "subjectName is required" }, { status: 400 , headers: gate.headers });
  }

  const hash = hashStr(subjectName);

  // Deterministic licence assignment
  const licenceCount = hash % 3;
  const licences: string[] = [];
  for (let i = 0; i < licenceCount; i++) {
    licences.push(CASINO_LICENCE_TYPES[(hash + i) % CASINO_LICENCE_TYPES.length]!);
  }

  const casinoExposure = licenceCount > 0 || hash % 4 === 0;
  const chipDumpingRisk = casinoExposure && hash % 3 === 0;

  const highRollerFlags: string[] = [];
  if (casinoExposure && hash % 2 === 0) {
    highRollerFlags.push("Historical high-value chip transactions in Macau-linked casinos");
  }
  if (chipDumpingRisk) {
    highRollerFlags.push("Chip-dumping pattern identified — deliberate loss to third party");
    highRollerFlags.push("Casino receipts used as apparent source of funds explanation");
  }
  if (hash % 5 === 0) {
    highRollerFlags.push("VIP junket operator associations detected");
  }
  if (hash % 7 === 0) {
    highRollerFlags.push(`Gaming activity in ${GAMING_JURISDICTIONS[hash % GAMING_JURISDICTIONS.length]} — unlicensed market`);
  }
  if (casinoExposure) {
    highRollerFlags.push("Casino winnings potentially used as legitimate income narrative for unexplained wealth");
  }

  const riskLevel = chipDumpingRisk ? "HIGH" : casinoExposure && highRollerFlags.length > 2 ? "MEDIUM" : casinoExposure ? "LOW" : "MINIMAL";

  return NextResponse.json({
    ok: true,
    licences,
    casinoExposure,
    chipDumpingRisk,
    highRollerFlags,
    riskLevel,
  }, { headers: gate.headers });
}
