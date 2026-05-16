export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export interface MapNode {
  id: string;
  name: string;
  country: string;
  type: "company" | "supplier" | "country";
  riskLevel: "critical" | "high" | "medium" | "low" | "unknown";
  riskScore: number;
  flags: string[];
  x?: number;
  y?: number;
}

export interface MapEdge {
  from: string;
  to: string;
  label?: string;
}

export interface SupplyChainMapResult {
  ok: true;
  nodes: MapNode[];
  edges: MapEdge[];
  countryRiskSummary: Array<{
    country: string;
    supplierCount: number;
    riskLevel: "critical" | "high" | "medium" | "low" | "unknown";
    riskScore: number;
    flags: string[];
  }>;
}

// Country risk reference table (Transparency International CPI + FATF lists + sanctions)
const COUNTRY_RISK: Record<string, { level: "critical" | "high" | "medium" | "low"; score: number; flags: string[] }> = {
  "DRC": { level: "critical", score: 92, flags: ["Conflict minerals", "Forced labour", "FATF monitored"] },
  "Myanmar": { level: "critical", score: 90, flags: ["Military sanctions", "Forced labour", "FATF grey list"] },
  "North Korea": { level: "critical", score: 99, flags: ["UN sanctions", "OFAC SDN", "Forced labour"] },
  "Iran": { level: "critical", score: 98, flags: ["OFAC sanctions", "UN sanctions", "FATF blacklist"] },
  "Russia": { level: "critical", score: 88, flags: ["OFAC sanctions", "EU sanctions", "Ukraine conflict"] },
  "Belarus": { level: "critical", score: 87, flags: ["EU sanctions", "OFAC sanctions"] },
  "China": { level: "high", score: 68, flags: ["UFLPA (Xinjiang)", "Trade controls", "Geopolitical risk"] },
  "Kazakhstan": { level: "high", score: 62, flags: ["Corruption risk", "AML/CFT concerns"] },
  "Nigeria": { level: "high", score: 65, flags: ["Corruption risk", "Illicit financial flows"] },
  "Pakistan": { level: "high", score: 60, flags: ["FATF monitoring history", "Corruption risk"] },
  "Bangladesh": { level: "medium", score: 48, flags: ["Labour standards risk", "Factory safety"] },
  "Vietnam": { level: "medium", score: 42, flags: ["Labour standards monitoring"] },
  "India": { level: "medium", score: 38, flags: ["Regional labour risks", "Informality"] },
  "Brazil": { level: "medium", score: 35, flags: ["Deforestation risk", "Amazon supply chains"] },
  "Mexico": { level: "medium", score: 40, flags: ["Cartel influence in some regions"] },
  "Turkey": { level: "medium", score: 45, flags: ["Geopolitical risk", "Sanctions evasion monitoring"] },
  "UAE": { level: "low", score: 22, flags: [] },
  "Germany": { level: "low", score: 8, flags: [] },
  "Switzerland": { level: "low", score: 7, flags: [] },
  "UK": { level: "low", score: 10, flags: [] },
  "USA": { level: "low", score: 12, flags: [] },
  "Canada": { level: "low", score: 9, flags: [] },
  "Australia": { level: "low", score: 11, flags: [] },
  "Japan": { level: "low", score: 8, flags: [] },
  "Singapore": { level: "low", score: 10, flags: [] },
};

function getCountryRisk(country: string): { level: "low" | "medium" | "high" | "critical"; score: number; flags: string[] } {
  const key = Object.keys(COUNTRY_RISK).find(
    (k) => k.toLowerCase() === country.toLowerCase()
  );
  return (key ? COUNTRY_RISK[key as keyof typeof COUNTRY_RISK] : undefined) ?? { level: "medium" as const, score: 50, flags: ["Risk data unavailable — manual review required"] };
}

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    company?: string;
    suppliers?: Array<{ name: string; country: string; riskLevel?: string }>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const company = body.company ?? "Company";
  const suppliers = Array.isArray(body.suppliers) ? body.suppliers : [];

  // Build nodes
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  // Root node
  nodes.push({
    id: "root",
    name: company,
    country: "HQ",
    type: "company",
    riskLevel: "low",
    riskScore: 0,
    flags: [],
  });

  // Supplier nodes + country aggregation
  const countryMap: Map<string, { suppliers: string[]; flags: Set<string> }> = new Map();

  suppliers.forEach((s, idx) => {
    const id = `sup-${idx}`;
    const countryRisk = getCountryRisk(s.country);
    nodes.push({
      id,
      name: s.name,
      country: s.country,
      type: "supplier",
      riskLevel: (s.riskLevel as MapNode["riskLevel"]) ?? countryRisk.level,
      riskScore: countryRisk.score,
      flags: countryRisk.flags,
    });
    edges.push({ from: "root", to: id, label: "sources from" });

    // Country node
    const cKey = s.country;
    if (!countryMap.has(cKey)) {
      countryMap.set(cKey, { suppliers: [], flags: new Set() });
    }
    const cEntry = countryMap.get(cKey)!;
    cEntry.suppliers.push(s.name);
    countryRisk.flags.forEach((f) => cEntry.flags.add(f));
  });

  // Country summary nodes
  const countryRiskSummary = Array.from(countryMap.entries()).map(([country, data]) => {
    const cr = getCountryRisk(country);
    return {
      country,
      supplierCount: data.suppliers.length,
      riskLevel: cr.level,
      riskScore: cr.score,
      flags: Array.from(data.flags),
    };
  });

  return NextResponse.json({
    ok: true,
    nodes,
    edges,
    countryRiskSummary,
  } satisfies SupplyChainMapResult, { headers: gate.headers });
}
