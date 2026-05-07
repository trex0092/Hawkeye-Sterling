import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { FIU_DPMS_TYPOLOGIES_2025, getCoverageMatrix } from "../../../../../dist/src/brain/registry/fiu-dpms-typologies-2025.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// GET /api/fiu-typology-check
//   Returns the full coverage matrix of FIU DPMS Sept 2025 typologies
//   against existing Hawkeye brain modes for FATF 5th Round IO.6 alignment.
//
// POST /api/fiu-typology-check
//   Body: { typologyId?: string } — returns details for a specific typology.

// Coverage matrix entry shape — mirrors getCoverageMatrix() return type
interface CoverageEntry {
  typologyId: string;
  title: string;
  coveredModes: string[];
  gaps: string[];
  coverageScore: number;
}

// Typology entry shape — mirrors FiuDpmsTypology from the source registry
interface TypologyEntry {
  id: string;
  title: string;
  description: string;
  redFlags: string[];
  fatfRecommendations: string[];
  mappedBrainModes: string[];
  coverageGaps: string[];
  riskRating: "critical" | "high" | "medium";
  reportSection: string;
}

export interface FiuCoverageResponse {
  ok: boolean;
  reportDate: string;
  generatedAt: string;
  typologies: typeof FIU_DPMS_TYPOLOGIES_2025;
  coverageMatrix: CoverageEntry[];
  overallCoverage: number; // 0-100 average across all typologies
  fullyCoveredCount: number;
  partiallyCoveredCount: number;
  uncoveredCount: number;
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const matrix = getCoverageMatrix() as CoverageEntry[];
  const overallCoverage = Math.round(matrix.reduce((sum: number, m: CoverageEntry) => sum + m.coverageScore, 0) / matrix.length);
  const fullyCoveredCount = matrix.filter((m: CoverageEntry) => m.coverageScore >= 80).length;
  const partiallyCoveredCount = matrix.filter((m: CoverageEntry) => m.coverageScore > 0 && m.coverageScore < 80).length;
  const uncoveredCount = matrix.filter((m: CoverageEntry) => m.coverageScore === 0).length;

  const response: FiuCoverageResponse = {
    ok: true,
    reportDate: "September 2025",
    generatedAt: new Date().toISOString(),
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
    const typology = (FIU_DPMS_TYPOLOGIES_2025 as TypologyEntry[]).find((t: TypologyEntry) => t.id === body.typologyId);
    if (!typology) {
      return NextResponse.json({ ok: false, error: `typology ${body.typologyId} not found` }, { status: 404, headers: gate.headers });
    }
    const matrix = (getCoverageMatrix() as CoverageEntry[]).find((m: CoverageEntry) => m.typologyId === body.typologyId);
    return NextResponse.json({ ok: true, typology, coverage: matrix }, { headers: gate.headers });
  }

  // Full matrix
  const matrix = getCoverageMatrix() as CoverageEntry[];
  const overallCoverage = Math.round(matrix.reduce((sum: number, m: CoverageEntry) => sum + m.coverageScore, 0) / matrix.length);
  return NextResponse.json({
    ok: true,
    typologies: FIU_DPMS_TYPOLOGIES_2025,
    coverageMatrix: matrix,
    overallCoverage,
  }, { headers: gate.headers });
}
