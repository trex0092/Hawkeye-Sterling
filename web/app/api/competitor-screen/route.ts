export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
interface CompetitorProfile {
  name: string;
  riskScore: number;
  riskLevel: "critical" | "high" | "medium" | "low";
  jurisdiction: string;
  industry: string;
  flags: string[];
  similarity: number;
}

const INDUSTRY_PEERS: Record<string, Array<Omit<CompetitorProfile, "riskLevel">>> = {
  "real estate": [
    { name: "Emerald Properties FZE", riskScore: 72, jurisdiction: "UAE (JAFZA)", industry: "Real Estate", flags: ["Free zone entity", "Cash purchases"], similarity: 87 },
    { name: "Crimson Realty Holdings Ltd", riskScore: 68, jurisdiction: "British Virgin Islands", industry: "Real Estate", flags: ["Offshore incorporation", "Nominee directors"], similarity: 82 },
    { name: "Azure Land Development LLC", riskScore: 45, jurisdiction: "UAE (Mainland)", industry: "Real Estate", flags: ["Round-number transactions"], similarity: 78 },
    { name: "Pinnacle Group DMCC", riskScore: 81, jurisdiction: "UAE (DMCC)", industry: "Real Estate", flags: ["PEP-linked director", "Rapid asset flipping"], similarity: 74 },
    { name: "Crestview Investment Properties", riskScore: 33, jurisdiction: "UK", industry: "Real Estate", flags: [], similarity: 71 },
  ],
  "financial services": [
    { name: "Pacific Bridge Capital Ltd", riskScore: 78, jurisdiction: "Cayman Islands", industry: "Financial Services", flags: ["Offshore fund", "Complex layering"], similarity: 85 },
    { name: "Meridian Asset Management", riskScore: 55, jurisdiction: "Luxembourg", industry: "Financial Services", flags: ["High-volume wire transfers"], similarity: 80 },
    { name: "Cornerstone Wealth LLC", riskScore: 41, jurisdiction: "UAE", industry: "Financial Services", flags: [], similarity: 76 },
    { name: "Vantage Capital Partners", riskScore: 88, jurisdiction: "Panama", industry: "Financial Services", flags: ["Panama Papers exposure", "Nominee structure"], similarity: 73 },
    { name: "Oakwood Finance Group", riskScore: 29, jurisdiction: "Switzerland", industry: "Financial Services", flags: [], similarity: 68 },
  ],
  "trading": [
    { name: "Global Commodity Traders FZE", riskScore: 75, jurisdiction: "UAE (Sharjah FZ)", industry: "Trading", flags: ["Vague goods descriptions", "TBML indicators"], similarity: 89 },
    { name: "Triton Import Export LLC", riskScore: 62, jurisdiction: "UAE", industry: "Trading", flags: ["Round-trip transactions"], similarity: 84 },
    { name: "Crescent Trade International", riskScore: 53, jurisdiction: "Turkey", industry: "Trading", flags: ["FATF grey-list jurisdiction"], similarity: 79 },
    { name: "Alliance General Trading LLC", riskScore: 38, jurisdiction: "UAE", industry: "Trading", flags: [], similarity: 72 },
    { name: "Sterling Commodities Ltd", riskScore: 85, jurisdiction: "Seychelles", industry: "Trading", flags: ["Offshore shell", "PEP connection", "Sanctions adjacent"], similarity: 70 },
  ],
  "technology": [
    { name: "DataVault Systems FZE", riskScore: 44, jurisdiction: "UAE (DTEC)", industry: "Technology", flags: ["Crypto payments accepted"], similarity: 83 },
    { name: "Nexgen Digital Solutions", riskScore: 58, jurisdiction: "Estonia (e-resident)", industry: "Technology", flags: ["Digital nomad structure", "Crypto revenues"], similarity: 78 },
    { name: "AlphaStack Technologies", riskScore: 31, jurisdiction: "UK", industry: "Technology", flags: [], similarity: 74 },
    { name: "ByteCore Analytics LLC", riskScore: 67, jurisdiction: "UAE", industry: "Technology", flags: ["Unusual cash deposits", "High-value consultant payments"], similarity: 70 },
    { name: "Quantum Innovations Ltd", riskScore: 49, jurisdiction: "Singapore", industry: "Technology", flags: [], similarity: 65 },
  ],
  "construction": [
    { name: "Ironclad Contracting LLC", riskScore: 70, jurisdiction: "UAE", industry: "Construction", flags: ["Subcontractor cash payments", "Inflated contracts"], similarity: 86 },
    { name: "Apex Build Group FZE", riskScore: 56, jurisdiction: "UAE (Free Zone)", industry: "Construction", flags: ["Free zone entity", "UBO unclear"], similarity: 81 },
    { name: "Consolidated Infrastructure Ltd", riskScore: 42, jurisdiction: "UK", industry: "Construction", flags: [], similarity: 77 },
    { name: "Delta Engineering Holdings", riskScore: 79, jurisdiction: "BVI", industry: "Construction", flags: ["Offshore parent", "Government contract irregularities"], similarity: 72 },
    { name: "Bedrock Developments LLC", riskScore: 35, jurisdiction: "UAE", industry: "Construction", flags: [], similarity: 68 },
  ],
};

const DEFAULT_PEERS: Array<Omit<CompetitorProfile, "riskLevel">> = [
  { name: "Generic Holdings Ltd", riskScore: 65, jurisdiction: "British Virgin Islands", industry: "Multi-sector", flags: ["Offshore incorporation", "Bearer shares"], similarity: 75 },
  { name: "Atlas International FZE", riskScore: 71, jurisdiction: "UAE (Free Zone)", industry: "Multi-sector", flags: ["Nominee directors", "Shell indicators"], similarity: 70 },
  { name: "Sovereign Trade Group", riskScore: 48, jurisdiction: "UAE", industry: "Multi-sector", flags: [], similarity: 65 },
  { name: "Beacon Enterprises LLC", riskScore: 82, jurisdiction: "Seychelles", industry: "Multi-sector", flags: ["High-risk jurisdiction", "PEP links", "Sanctions adjacent"], similarity: 62 },
  { name: "Clearwater Partners Ltd", riskScore: 29, jurisdiction: "UK", industry: "Multi-sector", flags: [], similarity: 58 },
];

function getRiskLevel(score: number): CompetitorProfile["riskLevel"] {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function findPeers(subjectName: string, industry?: string): CompetitorProfile[] {
  const industryKey = Object.keys(INDUSTRY_PEERS).find(
    (k) => industry?.toLowerCase().includes(k) || k.includes(industry?.toLowerCase() ?? "")
  );
  const rawPeers = industryKey ? (INDUSTRY_PEERS[industryKey] ?? DEFAULT_PEERS) : DEFAULT_PEERS;

  // Deterministic shuffle based on subject name
  const seed = subjectName.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const shuffled = [...rawPeers].sort((a, b) => ((a.riskScore + seed) % 7) - ((b.riskScore + seed) % 7));

  return shuffled.slice(0, 5).map((p) => ({ ...p, riskLevel: getRiskLevel(p.riskScore) }));
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { subjectName: string; industry?: string; jurisdiction?: string };
  try {
    body = (await req.json()) as { subjectName: string; industry?: string; jurisdiction?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  if (!body.subjectName?.trim()) {
    return NextResponse.json({ ok: false, error: "subjectName required" }, { status: 400 , headers: gate.headers});
  }

  const competitors = findPeers(body.subjectName, body.industry);
  const avgScore = Math.round(competitors.reduce((s, c) => s + c.riskScore, 0) / competitors.length);

  return NextResponse.json({
    ok: true,
    subjectName: body.subjectName,
    industry: body.industry ?? "general",
    jurisdiction: body.jurisdiction ?? "unspecified",
    competitors,
    peerGroupAvgRisk: avgScore,
    peerGroupRiskLevel: getRiskLevel(avgScore),
    methodology: "Stub peer-similarity engine — matches by industry vertical and risk profile patterns",
  });
}
