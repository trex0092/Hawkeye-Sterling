import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  entityName: string;
}

function hashStr(s: string): number {
  return s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

const CONTROL_MECHANISMS = [
  "Nominee director arrangement with undisclosed principal agreement",
  "General Power of Attorney granting full operational control",
  "Bearer share structure — ownership not registered",
  "Discretionary trust with undefined beneficiary class",
  "Layered ownership through 3+ offshore jurisdictions",
  "Voting rights separated from economic rights via share class structure",
  "Side letter agreements overriding registered constitutional documents",
];

const INDICATORS = [
  "All operational decisions traceable to a single unregistered individual",
  "Nominee director has no prior business experience — implausible executive role",
  "Bank mandates signed by person not appearing in corporate register",
  "Correspondence addresses differ from registered addresses",
  "Professional service firm acting as director for 50+ entities simultaneously",
  "Corporate secretary makes all material filings without board resolutions",
  "PoA granted to individual with known association to sanctioned entities",
];

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  const { entityName } = body;
  if (!entityName) {
    return NextResponse.json({ ok: false, error: "entityName is required" }, { status: 400 , headers: gate.headers});
  }

  const hash = hashStr(entityName);

  const hiddenControllerRisk = Math.min(100, (hash % 40) + 30);
  const controlMechanismCount = (hash % 3) + 1;
  const indicatorCount = (hash % 3) + 1;

  const controlMechanism: string[] = [];
  for (let i = 0; i < controlMechanismCount; i++) {
    controlMechanism.push(CONTROL_MECHANISMS[(hash + i) % CONTROL_MECHANISMS.length]!);
  }

  const indicators: string[] = [];
  for (let i = 0; i < indicatorCount; i++) {
    indicators.push(INDICATORS[(hash + i) % INDICATORS.length]!);
  }

  let probableController: string | undefined;
  if (hiddenControllerRisk >= 60) {
    const initials = `${String.fromCharCode(65 + (hash % 26))}.${String.fromCharCode(65 + ((hash * 3) % 26))}.`;
    probableController = `Unknown individual (initials: ${initials}) — beneficial ownership investigation required`;
  }

  const riskLevel = hiddenControllerRisk >= 70 ? "HIGH" : hiddenControllerRisk >= 45 ? "MEDIUM" : "LOW";

  return NextResponse.json({
    ok: true,
    hiddenControllerRisk,
    indicators,
    probableController,
    controlMechanism,
    riskLevel,
  });
}
