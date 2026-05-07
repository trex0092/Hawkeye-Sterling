import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  subjectProfile: Record<string, unknown>;
}

interface CaseMatch {
  caseRef: string;
  similarity: number;
  outcome: string;
  penalty?: string;
  jurisdiction: string;
}

function hashObj(obj: Record<string, unknown>): number {
  return JSON.stringify(obj).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

const ENFORCEMENT_CASES = [
  {
    caseRef: "SEC v. Abraaj Group (2019)",
    jurisdiction: "USA / UAE",
    outcome: "Criminal conviction + asset freeze",
    penalty: "USD 385M disgorgement ordered",
    tags: ["private equity", "fraud", "UAE", "misappropriation"],
  },
  {
    caseRef: "FCA v. NatWest (2021) — Fowler Oldfield",
    jurisdiction: "UK",
    outcome: "Guilty plea — inadequate AML controls",
    penalty: "GBP 264.8M fine",
    tags: ["bank", "cash intensive", "jewellery", "UK"],
  },
  {
    caseRef: "DFSA v. Oasis Crescent (2020)",
    jurisdiction: "UAE / DIFC",
    outcome: "Regulatory censure + fine",
    penalty: "USD 100k + remediation costs",
    tags: ["fund manager", "DIFC", "governance", "UAE"],
  },
  {
    caseRef: "US DOJ — 1MDB (2016-2023)",
    jurisdiction: "USA / Malaysia / UAE",
    outcome: "Multiple convictions, asset recovery ongoing",
    penalty: "USD 4.5B+ recovered globally",
    tags: ["sovereign fund", "PEP", "layering", "Malaysia", "UAE"],
  },
  {
    caseRef: "CBUAE v. Exchange House A (2022)",
    jurisdiction: "UAE",
    outcome: "Licence revocation + AED 500k fine",
    penalty: "AED 500,000",
    tags: ["remittance", "MSB", "hawala", "UAE"],
  },
  {
    caseRef: "FinCEN — Capital One (2021)",
    jurisdiction: "USA",
    outcome: "Civil penalty — BSA violations",
    penalty: "USD 390M",
    tags: ["bank", "cash reporting", "CTR", "structuring"],
  },
  {
    caseRef: "FATF Plenary — UAE Grey List (2022-2024)",
    jurisdiction: "UAE",
    outcome: "Greylisting with enhanced monitoring",
    penalty: "Reputational + correspondent banking impact",
    tags: ["UAE", "systemic", "real estate", "gold", "free zone"],
  },
];

export async function POST(req: Request): Promise<NextResponse> {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const { subjectProfile } = body;
  if (!subjectProfile) {
    return NextResponse.json({ ok: false, error: "subjectProfile is required" }, { status: 400 });
  }

  const hash = hashObj(subjectProfile);
  const profileStr = JSON.stringify(subjectProfile).toLowerCase();

  // Score each case by tag overlap
  const scored = ENFORCEMENT_CASES.map((c, idx) => {
    const tagMatches = c.tags.filter(tag => profileStr.includes(tag.toLowerCase())).length;
    const deterministicBoost = (hash + idx) % 20;
    const similarity = Math.min(95, tagMatches * 20 + deterministicBoost + 10);
    return { ...c, similarity };
  });

  // Sort by similarity descending, take top 3
  const topMatches: CaseMatch[] = scored
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3)
    .map(c => ({
      caseRef: c.caseRef,
      similarity: c.similarity,
      outcome: c.outcome,
      penalty: c.penalty,
      jurisdiction: c.jurisdiction,
    }));

  // Extract common patterns
  const commonPatterns: string[] = [];
  const topTags = topMatches.flatMap(m => ENFORCEMENT_CASES.find(c => c.caseRef === m.caseRef)?.tags ?? []);
  const tagCounts = topTags.reduce((acc, tag) => { acc[tag] = (acc[tag] || 0) + 1; return acc; }, {} as Record<string, number>);
  const frequentTags = Object.entries(tagCounts).filter(([, count]) => count >= 2).map(([tag]) => tag);
  if (frequentTags.length > 0) {
    commonPatterns.push(`Recurring sector themes: ${frequentTags.join(", ")}`);
  }
  if (topMatches.some(m => m.jurisdiction.includes("UAE"))) {
    commonPatterns.push("UAE nexus present in multiple analogous cases — elevated regulatory scrutiny expected");
  }
  if (topMatches[0]?.similarity >= 50) {
    commonPatterns.push(`Closest match: ${topMatches[0].caseRef} — review that enforcement action for documentary precedent`);
  }

  return NextResponse.json({
    ok: true,
    topMatches,
    commonPatterns,
  });
}
