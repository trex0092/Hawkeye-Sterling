// POST /api/onboarding-risk-tier
//
// Deterministic risk-tier scorer for the guided onboarding wizard.
// Wraps src/brain/onboarding-risk-tier.ts so the wizard (a client
// component) can run the scorer without importing brain code directly.
//
// Body:
//   {
//     fullName, nationalityIso2, dob, occupation, sourceOfFunds,
//     expectedProfile, address, screeningHits[]
//   }
// Response: OnboardingRiskResult — tier, score, factors[], rationale,
// jurisdictionHits[]

import { NextResponse } from "next/server";
import { classifyOnboardingRiskTier } from "../../../../dist/src/brain/onboarding-risk-tier.js";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

interface Body {
  fullName?: string;
  nationalityIso2?: string;
  dob?: string;
  occupation?: string;
  sourceOfFunds?: string;
  expectedProfile?: string;
  address?: string;
  screeningHits?: Array<{ listId: string; candidateName: string; score: number }>;
}

export async function POST(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }
  const result = classifyOnboardingRiskTier({
    ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
    ...(body.nationalityIso2 !== undefined ? { nationalityIso2: body.nationalityIso2 } : {}),
    ...(body.dob !== undefined ? { dob: body.dob } : {}),
    ...(body.occupation !== undefined ? { occupation: body.occupation } : {}),
    ...(body.sourceOfFunds !== undefined ? { sourceOfFunds: body.sourceOfFunds } : {}),
    ...(body.expectedProfile !== undefined ? { expectedProfile: body.expectedProfile } : {}),
    ...(body.address !== undefined ? { address: body.address } : {}),
    ...(body.screeningHits !== undefined ? { screeningHits: body.screeningHits } : {}),
  });
  return NextResponse.json({ ok: true, ...result }, { headers: CORS });
}
