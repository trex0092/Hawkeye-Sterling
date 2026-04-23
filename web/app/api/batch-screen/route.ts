import { NextResponse } from "next/server";
// Import from the concrete module, not the index barrel — see super-brain
// route for why pulling in the 80-module barrel at cold-start kills these
// Netlify Functions with 502s.
import { quickScreen as _quickScreen } from "../../../../dist/src/brain/quick-screen.js";
import type {
  QuickScreenCandidate,
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";
import { loadCandidates } from "@/lib/server/candidates-loader";
import { classifyAdverseKeywords } from "@/lib/data/adverse-keywords";
import { classifyEsg } from "@/lib/data/esg";
import { enforce } from "@/lib/server/enforce";

type QuickScreenFn = (
  subject: QuickScreenSubject,
  candidates: QuickScreenCandidate[],
) => QuickScreenResult;
const quickScreen = _quickScreen as QuickScreenFn;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BatchRow {
  name: string;
  aliases?: string[];
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  dob?: string;
  gender?: string;
  idNumber?: string;
}

interface Body {
  rows: BatchRow[];
}

interface RowResult {
  name: string;
  entityType?: string;
  aliases?: string[];
  dob?: string;
  gender?: string;
  jurisdiction?: string;
  idNumber?: string;
  topScore: number;
  severity: string;
  hitCount: number;
  listCoverage: string[];
  keywordGroups: string[];
  esgCategories: string[];
  durationMs: number;
  error?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  // Batch is the single highest-cost endpoint (500 rows × brain
  // screening each). Gate + rate-limit before touching the body.
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  // Load live watchlist corpus once per batch request (cached in-process).
  const CANDIDATES = await loadCandidates();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!Array.isArray(body?.rows)) {
    return NextResponse.json(
      { ok: false, error: "rows must be an array" },
      { status: 400, headers: gate.headers },
    );
  }
  if (body.rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "rows is empty" },
      { status: 400, headers: gate.headers },
    );
  }
  if (body.rows.length > 500) {
    return NextResponse.json(
      { ok: false, error: "batch size exceeds 500-row limit" },
      { status: 400, headers: gate.headers },
    );
  }

  const started = Date.now();
  const results: RowResult[] = [];
  for (const row of body.rows) {
    try {
      if (!row?.name?.trim()) {
        results.push({
          name: row?.name ?? "",
          topScore: 0,
          severity: "error",
          hitCount: 0,
          listCoverage: [],
          keywordGroups: [],
          esgCategories: [],
          durationMs: 0,
          error: "empty name",
        });
        continue;
      }
      const t0 = Date.now();
      // Validate alias elements — drop non-string entries to prevent type confusion.
      const cleanAliases = Array.isArray(row.aliases)
        ? (row.aliases as unknown[]).filter((a): a is string => typeof a === "string")
        : [];
      const subject = {
        name: row.name.trim(),
        ...(cleanAliases.length ? { aliases: cleanAliases } : {}),
        ...(row.entityType ? { entityType: row.entityType } : {}),
        ...(row.jurisdiction ? { jurisdiction: row.jurisdiction } : {}),
      };
      const screen = quickScreen(subject, CANDIDATES);
      const haystack = `${row.name} ${(row.aliases ?? []).join(" ")}`;
      const kw = classifyAdverseKeywords(haystack);
      const esg = classifyEsg(haystack);
      const row_result: RowResult = {
        name: row.name,
        topScore: screen.topScore,
        severity: screen.severity,
        hitCount: screen.hits.length,
        listCoverage: Array.from(new Set(screen.hits.map((h) => h.listId))),
        keywordGroups: Array.from(new Set(kw.map((k) => k.group))),
        esgCategories: Array.from(new Set(esg.map((e) => e.categoryId))),
        durationMs: Date.now() - t0,
      };
      if (row.entityType) row_result.entityType = row.entityType;
      if (row.aliases && row.aliases.length) row_result.aliases = row.aliases;
      if (row.dob) row_result.dob = row.dob;
      if (row.gender) row_result.gender = row.gender;
      if (row.jurisdiction) row_result.jurisdiction = row.jurisdiction;
      if (row.idNumber) row_result.idNumber = row.idNumber;
      results.push(row_result);
    } catch (err) {
      results.push({
        name: row?.name ?? "",
        topScore: 0,
        severity: "error",
        hitCount: 0,
        listCoverage: [],
        keywordGroups: [],
        esgCategories: [],
        durationMs: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const summary = {
    total: results.length,
    critical: results.filter((r) => r.severity === "critical").length,
    high: results.filter((r) => r.severity === "high").length,
    medium: results.filter((r) => r.severity === "medium").length,
    low: results.filter((r) => r.severity === "low").length,
    clear: results.filter((r) => r.severity === "clear").length,
    errors: results.filter((r) => r.error).length,
    totalDurationMs: Date.now() - started,
  };

  return NextResponse.json(
    { ok: true, summary, results },
    { headers: gate.headers },
  );
}
