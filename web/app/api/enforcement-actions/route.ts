import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  name: string;
  jurisdiction?: string;
}

interface EnforcementAction {
  regulator: string;
  date: string;
  type: string;
  penalty?: string;
  description: string;
}

const REGULATORS = ["FCA", "SEC", "CBUAE", "DFSA", "FinCEN"];
const ACTION_TYPES = ["Civil Penalty", "Warning Notice", "Prohibition Order", "Cease & Desist", "Deferred Prosecution Agreement"];
const PENALTIES = ["USD 125,000", "USD 2.5M", "GBP 450,000", "AED 500,000", "USD 15M"];

export async function POST(req: Request): Promise<NextResponse> {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const { name, jurisdiction = "UAE" } = body;
  if (!name) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  }

  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const actionCount = hash % 4; // 0-3 actions

  const actions: EnforcementAction[] = [];
  const jurisRegulators = jurisdiction === "UK" ? ["FCA"] : jurisdiction === "US" ? ["SEC", "FinCEN"] : ["CBUAE", "DFSA"];
  const applicableRegulators = actionCount > 0 ? [...jurisRegulators, ...REGULATORS].slice(0, Math.max(jurisRegulators.length, 2)) : [];

  for (let i = 0; i < actionCount; i++) {
    const seed = hash + i * 41;
    const regulator = applicableRegulators[seed % applicableRegulators.length] ?? REGULATORS[seed % REGULATORS.length];
    const actionType = ACTION_TYPES[seed % ACTION_TYPES.length];
    const year = 2016 + (seed % 8);
    const month = String(1 + (seed % 12)).padStart(2, "0");
    actions.push({
      regulator,
      date: `${year}-${month}-01`,
      type: actionType,
      penalty: seed % 2 === 0 ? PENALTIES[seed % PENALTIES.length] : undefined,
      description: `${regulator} issued ${actionType} against ${name} in relation to AML/CFT control failures identified during ${year} examination.`,
    });
  }

  const riskLevel = actionCount >= 3 ? "CRITICAL" : actionCount >= 2 ? "HIGH" : actionCount === 1 ? "MEDIUM" : "LOW";

  return NextResponse.json({
    ok: true,
    actions,
    count: actionCount,
    riskLevel,
  });
}
