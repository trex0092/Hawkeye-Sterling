import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  subjectId: string;
  clusterEntities: string[];
  // Optional: per-entity risk scores (0..100) from the caller's screening run.
  entityScores?: Record<string, number>;
  // Optional: directed edges in the cluster graph as [from, to] pairs.
  edges?: [string, string][];
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

  const { subjectId, clusterEntities = [], entityScores = {}, edges = [] } = body;
  if (!subjectId) {
    return NextResponse.json({ ok: false, error: "subjectId is required" }, { status: 400 });
  }

  const totalEntities = clusterEntities.length;
  if (totalEntities === 0) {
    return NextResponse.json({
      ok: true,
      contaminatedEntities: 0,
      highRiskLinks: [],
      propagatedScore: 0,
      recommendedActions: ["No cluster entities provided — run network mapping first"],
    });
  }

  // Build adjacency from supplied edges, falling back to fully-connected cluster.
  const adj = new Map<string, Set<string>>();
  const allNodes = new Set([subjectId, ...clusterEntities]);
  for (const n of allNodes) adj.set(n, new Set());

  if (edges.length > 0) {
    for (const [from, to] of edges) {
      adj.get(from)?.add(to);
      adj.get(to)?.add(from); // treat as undirected for contamination spread
    }
  } else {
    // No edges provided: assume the subject is directly linked to every cluster member.
    for (const e of clusterEntities) {
      adj.get(subjectId)?.add(e);
      adj.get(e)?.add(subjectId);
    }
  }

  // Subject's own risk score: use supplied score if available; default to 80
  // (caller is screening this entity specifically because it has AML concern).
  const subjectScore = entityScores[subjectId] ?? 80;

  // BFS propagation: contamination decreases by 40% per hop.
  const DECAY = 0.6;
  const contaminationScore = new Map<string, number>();
  contaminationScore.set(subjectId, subjectScore);

  const queue: string[] = [subjectId];
  const visited = new Set<string>([subjectId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentScore = contaminationScore.get(current) ?? 0;
    const neighbours = adj.get(current) ?? new Set();
    for (const neighbour of neighbours) {
      if (visited.has(neighbour)) continue;
      visited.add(neighbour);
      // Contamination is the higher of: propagated value OR the entity's own score.
      const ownScore = entityScores[neighbour] ?? 0;
      const propagated = currentScore * DECAY;
      contaminationScore.set(neighbour, Math.max(ownScore, propagated));
      queue.push(neighbour);
    }
  }

  // Classify cluster entities
  const HIGH_RISK_THRESHOLD = 60;
  const CONTAMINATED_THRESHOLD = 30;

  const highRiskLinks: string[] = [];
  let contaminatedCount = 0;
  for (const entity of clusterEntities) {
    const score = contaminationScore.get(entity) ?? 0;
    if (score >= HIGH_RISK_THRESHOLD) {
      highRiskLinks.push(entity);
      contaminatedCount++;
    } else if (score >= CONTAMINATED_THRESHOLD) {
      contaminatedCount++;
    }
  }

  // Cluster-level propagated score: weighted mean of all contaminated entities.
  const clusterScores = clusterEntities.map((e) => contaminationScore.get(e) ?? 0);
  const propagatedScore = clusterScores.length > 0
    ? Math.round(clusterScores.reduce((a, b) => a + b, 0) / clusterScores.length)
    : 0;

  // Select recommended actions proportional to contamination severity.
  const actionCount = Math.min(RECOMMENDED_ACTIONS.length, Math.ceil(1 + (propagatedScore / 100) * (RECOMMENDED_ACTIONS.length - 1)));
  const recommendedActions = RECOMMENDED_ACTIONS.slice(0, actionCount);

  return NextResponse.json({
    ok: true,
    contaminatedEntities: contaminatedCount,
    highRiskLinks,
    propagatedScore,
    recommendedActions,
    detail: {
      subjectScore,
      clusterSize: totalEntities,
      edgeCount: edges.length || totalEntities,
      scoresByEntity: Object.fromEntries(
        clusterEntities.map((e) => [e, Math.round(contaminationScore.get(e) ?? 0)]),
      ),
    },
  });
}
