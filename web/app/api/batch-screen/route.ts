import { NextResponse } from "next/server";
// Direct import, not the barrel — same rationale as super-brain/news-search:
// pulling the full brain barrel (~3-4MB compiled) bloats the serverless
// bundle past Netlify's cold-start budget.
import { quickScreen } from "../../../../dist/src/brain/quick-screen.js";
import { CANDIDATES } from "@/lib/data/candidates";
import { classifyAdverseKeywords } from "@/lib/data/adverse-keywords";
import { classifyEsg } from "@/lib/data/esg";

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
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body?.rows)) {
    return NextResponse.json(
      { ok: false, error: "rows must be an array" },
      { status: 400 },
    );
  }
  if (body.rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "rows is empty" },
      { status: 400 },
    );
  }
  if (body.rows.length > 500) {
    return NextResponse.json(
      { ok: false, error: "batch size exceeds 500-row limit" },
      { status: 400 },
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
      const subject = {
        name: row.name.trim(),
        ...(row.aliases && row.aliases.length ? { aliases: row.aliases } : {}),
        ...(row.entityType ? { entityType: row.entityType } : {}),
        ...(row.jurisdiction ? { jurisdiction: row.jurisdiction } : {}),
      };
      const screen = quickScreen(
        subject,
        CANDIDATES as Parameters<typeof quickScreen>[1],
      );
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

  return NextResponse.json({ ok: true, summary, results });
}
