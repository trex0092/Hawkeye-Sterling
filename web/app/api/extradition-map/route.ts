import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  jurisdiction: string;
}

// UAE extradition treaty data (deterministic lookup)
const UAE_EXTRADITION_TREATIES: Record<string, { hasTreaty: boolean; details: string; safeHavenRisk: boolean }> = {
  "UK": { hasTreaty: true, details: "UAE-UK Extradition Treaty 2008, operative for financial crimes including ML/TF", safeHavenRisk: false },
  "United Kingdom": { hasTreaty: true, details: "UAE-UK Extradition Treaty 2008, operative for financial crimes including ML/TF", safeHavenRisk: false },
  "USA": { hasTreaty: false, details: "No formal extradition treaty; MLA only via MLAT 2000. Case-by-case cooperation.", safeHavenRisk: true },
  "United States": { hasTreaty: false, details: "No formal extradition treaty; MLA only via MLAT 2000. Case-by-case cooperation.", safeHavenRisk: true },
  "India": { hasTreaty: true, details: "UAE-India Extradition Treaty 1999, covers economic offences", safeHavenRisk: false },
  "Pakistan": { hasTreaty: true, details: "UAE-Pakistan Extradition Treaty 1994", safeHavenRisk: false },
  "France": { hasTreaty: true, details: "UAE-France Extradition Treaty 2007", safeHavenRisk: false },
  "Germany": { hasTreaty: false, details: "No bilateral extradition treaty; EU-UAE cooperation framework applies", safeHavenRisk: false },
  "China": { hasTreaty: true, details: "UAE-China Extradition Treaty 2001", safeHavenRisk: false },
  "Russia": { hasTreaty: false, details: "No extradition treaty; historically limited cooperation on financial crimes", safeHavenRisk: true },
  "Panama": { hasTreaty: false, details: "No extradition treaty. Panama is a known safe haven jurisdiction.", safeHavenRisk: true },
  "BVI": { hasTreaty: false, details: "British Virgin Islands — UK treaty does not extend here for extradition purposes", safeHavenRisk: true },
  "Cayman Islands": { hasTreaty: false, details: "No direct treaty; UK treaty does not extend to Cayman Islands for extradition", safeHavenRisk: true },
  "Seychelles": { hasTreaty: false, details: "No extradition treaty. Frequently used for corporate structures.", safeHavenRisk: true },
  "Vanuatu": { hasTreaty: false, details: "No extradition treaty. High safe haven risk.", safeHavenRisk: true },
  "Turkey": { hasTreaty: true, details: "UAE-Turkey Extradition Treaty 2012", safeHavenRisk: false },
  "Jordan": { hasTreaty: true, details: "UAE-Jordan Extradition Treaty 1996", safeHavenRisk: false },
  "Egypt": { hasTreaty: true, details: "UAE-Egypt Extradition Treaty 1993", safeHavenRisk: false },
  "Iran": { hasTreaty: false, details: "No extradition treaty. FATF blacklisted. No operative cooperation.", safeHavenRisk: true },
  "North Korea": { hasTreaty: false, details: "No extradition treaty. UN sanctions regime. No cooperation.", safeHavenRisk: true },
};

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

  const { jurisdiction } = body;
  if (!jurisdiction) {
    return NextResponse.json({ ok: false, error: "jurisdiction is required" }, { status: 400 , headers: gate.headers });
  }

  const known = UAE_EXTRADITION_TREATIES[jurisdiction];
  const hash = hashStr(jurisdiction);

  const hasExtraditionWithUAE = known ? known.hasTreaty : hash % 3 === 0;
  const safeHavenRisk = known ? known.safeHavenRisk : !hasExtraditionWithUAE && hash % 2 === 0;
  const treatyDetails = known
    ? known.details
    : hasExtraditionWithUAE
    ? `UAE bilateral extradition arrangement with ${jurisdiction} — verify current status`
    : `No known extradition treaty between UAE and ${jurisdiction}. Mutual legal assistance only.`;

  const notes: string[] = [];
  if (!hasExtraditionWithUAE) notes.push("Subjects fleeing to this jurisdiction face reduced extradition risk");
  if (safeHavenRisk) notes.push("Jurisdiction classified as potential safe haven for financial crime fugitives");
  if (hash % 4 === 0) notes.push("Dual criminality requirement may limit cooperation even where treaty exists");
  if (hash % 5 === 0) notes.push("Political offence exception has been invoked in past cases");
  if (!hasExtraditionWithUAE) notes.push("UAE may pursue asset recovery via civil channels as alternative");

  const riskLevel = safeHavenRisk ? "HIGH" : !hasExtraditionWithUAE ? "MEDIUM" : "LOW";

  return NextResponse.json({
    ok: true,
    hasExtraditionWithUAE,
    treatyDetails,
    safeHavenRisk,
    notes,
    riskLevel,
  }, { headers: gate.headers });
}
