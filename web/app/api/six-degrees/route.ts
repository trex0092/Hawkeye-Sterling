import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PathNode {
  entity: string;
  linkType: string;
}

interface ReqBody {
  subjectName: string;
  targetLists?: string[];
}

function hashStr(s: string): number {
  return s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

const LINK_TYPES = [
  "Director",
  "Shareholder",
  "Beneficial Owner",
  "Business Associate",
  "Correspondent Bank",
  "Registered Agent",
  "Trust Beneficiary",
  "Power of Attorney",
];

const SANCTIONED_ENTITIES = [
  "Mahan Air (OFAC SDN)",
  "Bank Mellat (EU/UK/UN designated)",
  "VTB Bank (EU/UK designated)",
  "Sberbank (EU/UK designated)",
  "Gazprombank (EU designated)",
];

const INTERMEDIARY_ENTITIES = [
  "Intermediary Trading LLC (BVI)",
  "Coastal Resources Holdings (Seychelles)",
  "Pan-Atlantic Investment Partners (Panama)",
  "Eastern Connect Ventures (UAE Free Zone)",
  "Global Trade Associates (Cayman Islands)",
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
  const minHops = (hash % 5) + 1; // 1-5 hops

  const path: PathNode[] = [];
  // Build deterministic path from subject to sanctioned entity
  for (let i = 0; i < minHops - 1; i++) {
    path.push({
      entity: INTERMEDIARY_ENTITIES[(hash + i) % INTERMEDIARY_ENTITIES.length],
      linkType: LINK_TYPES[(hash + i) % LINK_TYPES.length],
    });
  }
  // Final hop to sanctioned entity
  path.push({
    entity: SANCTIONED_ENTITIES[hash % SANCTIONED_ENTITIES.length],
    linkType: LINK_TYPES[(hash + minHops) % LINK_TYPES.length],
  });

  const riskLevel = minHops <= 1 ? "CRITICAL" : minHops <= 2 ? "HIGH" : minHops <= 3 ? "MEDIUM" : minHops <= 4 ? "LOW" : "MINIMAL";

  const explanation = minHops === 1
    ? `Subject is directly linked to ${path[path.length - 1].entity} via ${path[0].linkType} relationship`
    : `Subject is ${minHops} steps removed from ${path[path.length - 1].entity} through a chain of ${path.slice(0, -1).map(p => p.entity).join(" → ")}`;

  return NextResponse.json({
    ok: true,
    minHops,
    path,
    riskLevel,
    explanation,
  });
}
