import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  subjectId: string;
  clusterEntities: string[];
}

function hashStr(s: string): number {
  return s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

const RECOMMENDED_ACTIONS = [
  "Escalate linked entities to enhanced due diligence review",
  "Freeze new transactions pending cluster-wide investigation",
  "File Suspicious Activity Report covering all contaminated entities",
  "Notify relationship managers of cluster risk elevation",
  "Commission network mapping to identify additional linked parties",
  "Apply enhanced monitoring on all cluster transaction activity",
  "Request updated source of funds documentation from all cluster members",
];

export async function POST(req: Request): Promise<NextResponse> {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const { subjectId, clusterEntities = [] } = body;
  if (!subjectId) {
    return NextResponse.json({ ok: false, error: "subjectId is required" }, { status: 400 });
  }

  const hash = hashStr(subjectId);
  const totalEntities = clusterEntities.length;

  // Contamination propagates based on link strength (deterministic)
  const contaminationRate = 0.4 + (hash % 40) / 100; // 40-79% contamination rate
  const contaminatedEntities = Math.ceil(totalEntities * contaminationRate);

  // Identify high-risk links
  const highRiskLinks: string[] = [];
  clusterEntities.forEach((entity, idx) => {
    const entityHash = hashStr(entity);
    if ((hash + entityHash + idx) % 3 === 0) {
      highRiskLinks.push(entity);
    }
  });

  // If no entities provided, generate stub data
  if (totalEntities === 0) {
    return NextResponse.json({
      ok: true,
      contaminatedEntities: 0,
      highRiskLinks: [],
      propagatedScore: 0,
      recommendedActions: ["No cluster entities provided — run network mapping first"],
    });
  }

  // Propagated risk score decreases with distance
  const baseContaminationScore = 60 + (hash % 30);
  const propagatedScore = Math.min(100, Math.round(baseContaminationScore * contaminationRate));

  const actionCount = Math.min(4, Math.ceil(contaminatedEntities / 2) + 1);
  const recommendedActions: string[] = [];
  for (let i = 0; i < actionCount; i++) {
    recommendedActions.push(RECOMMENDED_ACTIONS[(hash + i) % RECOMMENDED_ACTIONS.length]!);
  }

  return NextResponse.json({
    ok: true,
    contaminatedEntities,
    highRiskLinks,
    propagatedScore,
    recommendedActions,
  });
}
