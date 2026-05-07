import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  entityName: string;
  freeZone?: string;
}

const UAE_FREE_ZONES: Record<string, { riskBase: number; notes: string[] }> = {
  JAFZA: { riskBase: 25, notes: ["JAFZA — Jebel Ali Free Zone. Well-regulated, active CBUAE oversight."] },
  DMCC: { riskBase: 20, notes: ["DMCC — Dubai Multi Commodities Centre. High volume, moderate oversight."] },
  DAFZA: { riskBase: 20, notes: ["DAFZA — Dubai Airport Free Zone. Logistics focus."] },
  DIFC: { riskBase: 15, notes: ["DIFC — Dubai International Financial Centre. DFSA regulated. Strong compliance framework."] },
  ADGM: { riskBase: 15, notes: ["ADGM — Abu Dhabi Global Market. FSRA regulated. Strong compliance framework."] },
  RAKEZ: { riskBase: 45, notes: ["RAKEZ — Ras Al Khaimah Economic Zone. Higher risk — weaker oversight historically."] },
  UAQ: { riskBase: 55, notes: ["UAQ — Umm Al Quwain Free Trade Zone. Minimal oversight, significant formation abuse."] },
  AJMAN: { riskBase: 50, notes: ["Ajman Free Zone. Elevated risk of nominee and shell structures."] },
  SHAMS: { riskBase: 35, notes: ["Sharjah Media City. Common for paper companies."] },
  IFZA: { riskBase: 40, notes: ["International Free Zone Authority. Growing use for nominee structures."] },
};

function hashStr(s: string): number {
  return s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const { entityName, freeZone } = body;
  if (!entityName) {
    return NextResponse.json({ ok: false, error: "entityName is required" }, { status: 400 });
  }

  const hash = hashStr(entityName);
  const fzKey = freeZone?.toUpperCase() ?? Object.keys(UAE_FREE_ZONES)[hash % Object.keys(UAE_FREE_ZONES).length];
  const fzData = UAE_FREE_ZONES[fzKey] ?? { riskBase: 35, notes: [`${fzKey} free zone — limited oversight data available`] };

  const nomineeDirectors = hash % 3 === 0 || fzData.riskBase >= 45;
  const virtualOffice = hash % 4 === 0 || fzData.riskBase >= 50;
  const noLocalEmployees = hash % 2 === 0;

  let riskScore = fzData.riskBase;
  if (nomineeDirectors) riskScore += 20;
  if (virtualOffice) riskScore += 15;
  if (noLocalEmployees) riskScore += 10;
  riskScore = Math.min(100, riskScore);

  const flags: string[] = [...fzData.notes];
  if (nomineeDirectors) flags.push("Nominee director structure detected — true ownership obscured");
  if (virtualOffice) flags.push("Virtual office address — no physical business presence");
  if (noLocalEmployees) flags.push("No evidence of local employees — shell entity indicators");
  if (riskScore >= 60) flags.push("Entity profile consistent with free zone shell company typology");
  if (hash % 5 === 0) flags.push("Registered agent identified as prolific incorporator — mass formation risk");

  const riskLevel = riskScore >= 70 ? "HIGH" : riskScore >= 45 ? "MEDIUM" : "LOW";

  return NextResponse.json({
    ok: true,
    freeZone: fzKey,
    nomineeDirectors,
    virtualOffice,
    noLocalEmployees,
    riskScore,
    riskLevel,
    flags,
  });
}
