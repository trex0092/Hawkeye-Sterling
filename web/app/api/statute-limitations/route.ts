import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  offenceType: string;
  jurisdiction: string;
  offenceDate?: string;
}

interface LimitationRule {
  years: number;
  legalBasis: string;
}

const LIMITATION_RULES: Record<string, Record<string, LimitationRule>> = {
  "money laundering": {
    UAE: { years: 15, legalBasis: "Federal Decree Law No. 20/2021, Art 43 — 15 years for ML offences" },
    UK: { years: 0, legalBasis: "Proceeds of Crime Act 2002 — no limitation period for ML in UK" },
    USA: { years: 5, legalBasis: "18 U.S.C. § 3282 — 5 year general statute; 10 years for bank fraud predicate" },
    EU: { years: 10, legalBasis: "EU AML Directive 2018/843 — member states must provide 10+ year limitation" },
    default: { years: 7, legalBasis: "Typical AML limitation period for this jurisdiction" },
  },
  "terrorist financing": {
    UAE: { years: 0, legalBasis: "Federal Law No. 7/2014 — no limitation period for TF offences" },
    UK: { years: 0, legalBasis: "Terrorism Act 2000 — no limitation period" },
    USA: { years: 8, legalBasis: "18 U.S.C. § 3286 — 8 years for federal terrorism offences" },
    default: { years: 0, legalBasis: "Terrorism financing typically has no or extended limitation periods" },
  },
  "fraud": {
    UAE: { years: 10, legalBasis: "Federal Penal Code — 10 years for fraud-related offences" },
    UK: { years: 6, legalBasis: "Fraud Act 2006 / Limitation Act 1980 — 6 years standard" },
    USA: { years: 5, legalBasis: "18 U.S.C. § 3282 — 5 years; 10 years for financial institution fraud" },
    default: { years: 6, legalBasis: "Standard fraud limitation period" },
  },
  "bribery": {
    UAE: { years: 10, legalBasis: "Federal Penal Code Art 234 — 10 years for public official bribery" },
    UK: { years: 0, legalBasis: "Bribery Act 2010 — no limitation period for serious fraud/bribery (SFO)" },
    USA: { years: 5, legalBasis: "FCPA — 5 years from last act" },
    default: { years: 7, legalBasis: "Typical bribery limitation period" },
  },
  "tax evasion": {
    UAE: { years: 5, legalBasis: "Federal Tax Authority — 5 year assessment period, 15 years for fraud" },
    UK: { years: 20, legalBasis: "Finance Act 2008 — 20 years for deliberate tax fraud" },
    USA: { years: 6, legalBasis: "26 U.S.C. § 6531 — 6 years for tax fraud" },
    default: { years: 7, legalBasis: "Standard tax evasion limitation period" },
  },
};

export async function POST(req: Request): Promise<NextResponse> {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const { offenceType, jurisdiction, offenceDate } = body;
  if (!offenceType || !jurisdiction) {
    return NextResponse.json({ ok: false, error: "offenceType and jurisdiction are required" }, { status: 400 });
  }

  const offenceKey = offenceType.toLowerCase();
  const jurisKey = jurisdiction;

  const rules = LIMITATION_RULES[offenceKey] ?? LIMITATION_RULES["fraud"];
  const rule = rules[jurisKey] ?? rules["default"] ?? { years: 7, legalBasis: "Standard limitation period applied" };

  const today = new Date();
  const baseDate = offenceDate ? new Date(offenceDate) : new Date(today.getFullYear() - 2, today.getMonth(), today.getDate());

  let expiryDate: string;
  let expired: boolean;
  let daysUntilStale: number;
  let urgency: string;

  if (rule.years === 0) {
    expiryDate = "No expiry — offence is not subject to limitation";
    expired = false;
    daysUntilStale = 99999;
    urgency = "NO_URGENCY";
  } else {
    const expiry = new Date(baseDate);
    expiry.setFullYear(expiry.getFullYear() + rule.years);
    expiryDate = expiry.toISOString().split("T")[0];
    expired = expiry < today;
    daysUntilStale = Math.max(0, Math.floor((expiry.getTime() - today.getTime()) / 86400000));
    urgency = expired ? "EXPIRED" : daysUntilStale < 90 ? "CRITICAL" : daysUntilStale < 365 ? "HIGH" : daysUntilStale < 730 ? "MEDIUM" : "LOW";
  }

  return NextResponse.json({
    ok: true,
    offenceType,
    limitationYears: rule.years,
    expiryDate,
    expired,
    urgency,
    legalBasis: rule.legalBasis,
  });
}
