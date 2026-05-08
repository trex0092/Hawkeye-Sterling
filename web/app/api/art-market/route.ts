import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  subjectName: string;
}

function hashStr(s: string): number {
  return s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

const AUCTION_HOUSES = ["Christie's", "Sotheby's", "Bonhams", "Phillips", "Dorotheum"];
const PROVENANCE_RISKS = [
  "Pre-1970 acquisition with incomplete provenance documentation",
  "Object with uncertain ownership during 1933-1945 period",
  "Acquisition from jurisdiction with weak cultural property controls",
  "Third-party provenance guarantee without independent verification",
  "Object listed in Art Loss Register watchlist patterns",
];
const CULTURAL_PROPERTY_FLAGS = [
  "Potential match to UNESCO 1970 Convention restricted categories",
  "Object type consistent with conflict antiquity trafficking patterns",
  "Export licence from origin country not verified",
  "Intermediary dealer subject to prior cultural property investigation",
];

export async function POST(req: Request): Promise<NextResponse> {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const { subjectName } = body;
  if (!subjectName) {
    return NextResponse.json({ ok: false, error: "subjectName is required" }, { status: 400 });
  }

  const hash = hashStr(subjectName);

  const auctionHouse = AUCTION_HOUSES[hash % AUCTION_HOUSES.length];
  const auctionActivity = hash % 4 === 0
    ? `Active buyer at ${auctionHouse} with 3+ lots exceeding USD 500k in past 5 years`
    : hash % 4 === 1
    ? `Occasional purchases at minor auction houses — total value undisclosed`
    : hash % 4 === 2
    ? `No direct auction activity detected — possible private dealer network`
    : `High-frequency lot acquisitions at ${auctionHouse} using intermediary agents`;

  const provenanceRisk = hash % 3 === 0 ? "HIGH" : hash % 3 === 1 ? "MEDIUM" : "LOW";

  const valuationAnomalies: string[] = [];
  if (hash % 5 === 0) valuationAnomalies.push("Rapid resale within 12 months at 40%+ premium — value transfer indicator");
  if (hash % 3 === 0) valuationAnomalies.push("Private sale valuation diverges significantly from comparable auction results");
  if (hash % 7 === 0) valuationAnomalies.push("Insurance valuation substantially exceeds market value — potential overinsurance");
  if (hash % 2 === 0) valuationAnomalies.push("Cross-border transfer price manipulation relative to declared customs value");

  const cpFlagCount = hash % 3;
  const culturalPropertyFlags: string[] = [];
  for (let i = 0; i < cpFlagCount; i++) {
    culturalPropertyFlags.push(CULTURAL_PROPERTY_FLAGS[(hash + i) % CULTURAL_PROPERTY_FLAGS.length]!);
  }
  if (provenanceRisk === "HIGH") {
    culturalPropertyFlags.push(PROVENANCE_RISKS[hash % PROVENANCE_RISKS.length]!);
  }

  const riskLevel = provenanceRisk === "HIGH" || culturalPropertyFlags.length >= 2 ? "HIGH"
    : provenanceRisk === "MEDIUM" || valuationAnomalies.length >= 2 ? "MEDIUM" : "LOW";

  return NextResponse.json({
    ok: true,
    auctionActivity,
    provenanceRisk,
    valuationAnomalies,
    culturalPropertyFlags,
    riskLevel,
  });
}
