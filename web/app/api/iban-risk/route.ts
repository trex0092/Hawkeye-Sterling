export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

interface CountryRiskEntry {
  name: string;
  riskLevel: "critical" | "high" | "medium" | "low";
  fatfStatus: string;
  notes: string[];
}

const COUNTRY_RISK: Record<string, CountryRiskEntry> = {
  AF: { name: "Afghanistan", riskLevel: "critical", fatfStatus: "FATF Black List", notes: ["Jurisdictions subject to a call for action", "Severe AML/CFT deficiencies"] },
  IR: { name: "Iran", riskLevel: "critical", fatfStatus: "FATF Black List", notes: ["UN/OFAC/EU comprehensive sanctions", "No financial interaction recommended"] },
  KP: { name: "North Korea", riskLevel: "critical", fatfStatus: "FATF Black List", notes: ["UN/OFAC/EU comprehensive sanctions", "WMD proliferation financing risk"] },
  MM: { name: "Myanmar", riskLevel: "critical", fatfStatus: "FATF Black List", notes: ["Military junta — elevated risk", "OFAC sectoral sanctions"] },
  RU: { name: "Russia", riskLevel: "critical", fatfStatus: "FATF Suspended (2023)", notes: ["Comprehensive EU/UK/US/OFAC sanctions", "Elevated evasion/circumvention risk"] },
  BY: { name: "Belarus", riskLevel: "critical", fatfStatus: "High Risk", notes: ["EU/US/UK sectoral sanctions", "Political instability"] },
  SY: { name: "Syria", riskLevel: "critical", fatfStatus: "FATF Black List", notes: ["Comprehensive US/EU/UK sanctions", "Conflict zone"] },
  PK: { name: "Pakistan", riskLevel: "high", fatfStatus: "FATF Grey List (enhanced follow-up)", notes: ["Enhanced due diligence required", "CBUAE geographic risk classification: high"] },
  TR: { name: "Turkey", riskLevel: "high", fatfStatus: "FATF Grey List", notes: ["Enhanced monitoring", "Partial sanctions nexus"] },
  NG: { name: "Nigeria", riskLevel: "high", fatfStatus: "FATF Grey List", notes: ["Elevated corruption risk", "Enhanced monitoring required"] },
  VN: { name: "Vietnam", riskLevel: "high", fatfStatus: "FATF Grey List", notes: ["AML/CFT strategic deficiencies identified"] },
  ZA: { name: "South Africa", riskLevel: "high", fatfStatus: "FATF Grey List", notes: ["Enhanced monitoring", "Strategic deficiencies under remediation"] },
  AE: { name: "United Arab Emirates", riskLevel: "medium", fatfStatus: "FATF Member (under observation)", notes: ["UAE post-grey list — enhanced monitoring", "CBUAE active reform programme"] },
  CN: { name: "China", riskLevel: "medium", fatfStatus: "FATF Member", notes: ["Elevated correspondent banking risk", "Capital controls and OFAC secondary sanctions nexus"] },
  IN: { name: "India", riskLevel: "medium", fatfStatus: "FATF Member", notes: ["Moderate risk — large economy, improving AML framework"] },
  GB: { name: "United Kingdom", riskLevel: "low", fatfStatus: "FATF Member", notes: ["Strong AML/CFT regime", "FCA/NCA oversight"] },
  DE: { name: "Germany", riskLevel: "low", fatfStatus: "FATF Member", notes: ["AMLD6 compliant", "BaFin oversight"] },
  FR: { name: "France", riskLevel: "low", fatfStatus: "FATF Member", notes: ["AMLD6 compliant", "ACPR oversight"] },
  NL: { name: "Netherlands", riskLevel: "low", fatfStatus: "FATF Member", notes: ["AMLD6 compliant", "DNB oversight"] },
  CH: { name: "Switzerland", riskLevel: "low", fatfStatus: "FATF Member", notes: ["FINMA oversight", "Strong AML framework"] },
  US: { name: "United States", riskLevel: "low", fatfStatus: "FATF Member", notes: ["FinCEN/BSA framework", "Strong enforcement"] },
  SG: { name: "Singapore", riskLevel: "low", fatfStatus: "FATF Member", notes: ["MAS oversight", "APAC AML hub"] },
  HK: { name: "Hong Kong", riskLevel: "medium", fatfStatus: "FATF Member (HKMA)", notes: ["China proximity risk", "Strong local framework"] },
  JO: { name: "Jordan", riskLevel: "medium", fatfStatus: "FATF Member", notes: ["Regional instability exposure", "AMLU oversight"] },
  LB: { name: "Lebanon", riskLevel: "high", fatfStatus: "High Risk", notes: ["Sovereign default", "Hezbollah sanctions nexus", "Banking sector crisis"] },
  VE: { name: "Venezuela", riskLevel: "critical", fatfStatus: "OFAC Sanctions", notes: ["OFAC Maduro regime sanctions", "Petro cryptocurrency sanctions"] },
  CU: { name: "Cuba", riskLevel: "critical", fatfStatus: "US OFAC Embargo", notes: ["Comprehensive US embargo", "EU/UK lesser restrictions"] },
};

function parseIban(iban: string): { countryCode: string; bban: string; valid: boolean } {
  const clean = iban.replace(/\s/g, "").toUpperCase();
  if (clean.length < 4) return { countryCode: "", bban: "", valid: false };
  const countryCode = clean.slice(0, 2);
  const checkDigits = clean.slice(2, 4);
  const bban = clean.slice(4);
  // Basic check: country code should be alpha, check digits numeric
  const valid = /^[A-Z]{2}$/.test(countryCode) && /^\d{2}$/.test(checkDigits) && bban.length > 0;
  return { countryCode, bban, valid };
}

export async function POST(req: Request) {
  let body: { iban: string };
  try {
    body = (await req.json()) as { iban: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.iban?.trim()) {
    return NextResponse.json({ ok: false, error: "iban required" }, { status: 400 });
  }

  const { countryCode, bban, valid } = parseIban(body.iban);

  if (!valid) {
    return NextResponse.json({ ok: false, error: "Invalid IBAN format" }, { status: 400 });
  }

  const entry = COUNTRY_RISK[countryCode] ?? {
    name: `Country (${countryCode})`,
    riskLevel: "medium" as const,
    fatfStatus: "Unknown — apply standard CDD",
    notes: ["Country not in risk database — default medium risk applied", "Manual jurisdiction assessment recommended"],
  };

  return NextResponse.json({
    ok: true,
    iban: body.iban.replace(/\s/g, "").toUpperCase(),
    countryCode,
    bban,
    country: entry.name,
    riskLevel: entry.riskLevel,
    fatfStatus: entry.fatfStatus,
    notes: entry.notes,
    eddRequired: entry.riskLevel === "high" || entry.riskLevel === "critical",
    sanctionsCheck: entry.riskLevel === "critical",
  });
}
