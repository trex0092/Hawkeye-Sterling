import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  currentEvidence: string[];
  targetDisposition: string;
  riskScore: number;
}

const DISPOSITION_REQUIREMENTS: Record<string, { required: string[]; description: string }> = {
  CLEAR: {
    required: [
      "passport/ID verification",
      "proof of address",
      "source of funds documentation",
      "source of wealth explanation",
      "adverse media screening record",
      "sanctions screening certificate",
      "PEP screening certificate",
    ],
    description: "Clear — no suspicious activity, subject meets standard risk threshold",
  },
  MONITOR: {
    required: [
      "passport/ID verification",
      "proof of address",
      "source of funds documentation",
      "adverse media screening record",
      "sanctions screening certificate",
      "PEP screening certificate",
      "transaction monitoring setup confirmation",
      "enhanced monitoring trigger documented",
    ],
    description: "Monitor — elevated risk, ongoing monitoring required",
  },
  EDD: {
    required: [
      "passport/ID verification",
      "proof of address",
      "source of funds documentation",
      "source of wealth explanation",
      "adverse media screening record",
      "sanctions screening certificate",
      "PEP screening certificate",
      "independent wealth verification",
      "professional reference letter",
      "detailed business activity explanation",
      "beneficial ownership structure chart",
      "ultimate beneficial owner identification",
    ],
    description: "EDD — enhanced due diligence required before onboarding/continuation",
  },
  SAR: {
    required: [
      "chronological transaction narrative",
      "predicate offence hypothesis",
      "supporting transaction evidence",
      "sanctions/PEP screening record",
      "adverse media summary",
      "prior case history",
      "reporting officer sign-off",
      "legal privilege review if applicable",
    ],
    description: "SAR — Suspicious Activity Report filing required",
  },
  EXIT: {
    required: [
      "exit rationale documented",
      "risk committee approval",
      "wind-down plan",
      "STR/SAR consideration documented",
      "regulator notification if required",
      "asset freeze check",
    ],
    description: "Exit — terminate relationship",
  },
};

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
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

  const { currentEvidence = [], targetDisposition, riskScore } = body;
  if (!targetDisposition || riskScore === undefined) {
    return NextResponse.json({ ok: false, error: "targetDisposition and riskScore are required" }, { status: 400 , headers: gate.headers });
  }

  const dispositionKey = targetDisposition.toUpperCase();
  const requirements = DISPOSITION_REQUIREMENTS[dispositionKey] ?? DISPOSITION_REQUIREMENTS["CLEAR"] ?? { required: [], description: "Clear" };

  const normalisedEvidence = currentEvidence.map(normalise);

  const missingEvidence = requirements.required.filter(req => {
    const normReq = normalise(req);
    return !normalisedEvidence.some(e => e.includes(normReq.split(" ")[0]!) || normReq.includes(e.split(" ")[0]!));
  });

  const sufficiencyScore = Math.round(
    ((requirements.required.length - missingEvidence.length) / requirements.required.length) * 100
  );

  const requiredActions = missingEvidence.map(gap => `Obtain: ${gap}`);

  // High risk scores require more evidence
  if (riskScore >= 70 && dispositionKey === "CLEAR") {
    missingEvidence.push("Senior management approval for high-risk clear decision");
    requiredActions.push("Obtain: Senior management sign-off with documented rationale");
  }

  const readyToDispose = missingEvidence.length === 0 && sufficiencyScore >= 80;

  return NextResponse.json({
    ok: true,
    targetDisposition: requirements.description,
    sufficiencyScore,
    missingEvidence,
    requiredActions,
    readyToDispose,
  }, { headers: gate.headers });
}
