import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { FIU_DPMS_TYPOLOGIES_2025, getCoverageMatrix } from "../../../../../src/brain/registry/fiu-dpms-typologies-2025.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// GET /api/fiu-typology-check
//   Returns the full coverage matrix of FIU DPMS Sept 2025 typologies
//   against existing Hawkeye brain modes for FATF 5th Round IO.6 alignment.
//
// POST /api/fiu-typology-check
//   Body: { typologyId?: string } — returns details for a specific typology.

export interface FiuCoverageResponse {
  ok: boolean;
  reportDate: string;
  typologies: typeof FIU_DPMS_TYPOLOGIES_2025;
  coverageMatrix: ReturnType<typeof getCoverageMatrix>;
  overallCoverage: number; // 0-100 average across all typologies
  fullyCoveredCount: number;
  partiallyCoveredCount: number;
  uncoveredCount: number;
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const matrix = getCoverageMatrix();
  const overallCoverage = Math.round(matrix.reduce((s, m) => s + m.coverageScore, 0) / matrix.length);
  const fullyCoveredCount = matrix.filter((m) => m.coverageScore >= 80).length;
  const partiallyCoveredCount = matrix.filter((m) => m.coverageScore > 0 && m.coverageScore < 80).length;
  const uncoveredCount = matrix.filter((m) => m.coverageScore === 0).length;

  const response: FiuCoverageResponse = {
    ok: true,
    reportDate: "September 2025",
    typologies: FIU_DPMS_TYPOLOGIES_2025,
    coverageMatrix: matrix,
    overallCoverage,
    fullyCoveredCount,
    partiallyCoveredCount,
    uncoveredCount,
  };

  return NextResponse.json(response, { headers: gate.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { typologyId?: string };
  try { body = (await req.json()) as { typologyId?: string }; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers }); }

  if (body.typologyId) {
    const typology = FIU_DPMS_TYPOLOGIES_2025.find((t) => t.id === body.typologyId);
    if (!typology) {
      return NextResponse.json({ ok: false, error: `typology ${body.typologyId} not found` }, { status: 404, headers: gate.headers });
    }
    const matrix = getCoverageMatrix().find((m) => m.typologyId === body.typologyId);
    return NextResponse.json({ ok: true, typology, coverage: matrix }, { headers: gate.headers });
  }

  // Full matrix
  const matrix = getCoverageMatrix();
  const overallCoverage = Math.round(matrix.reduce((s, m) => s + m.coverageScore, 0) / matrix.length);
  return NextResponse.json({
    ok: true,
    typologies: FIU_DPMS_TYPOLOGIES_2025,
    coverageMatrix: matrix,
    overallCoverage,
  }, { headers: gate.headers });
}
