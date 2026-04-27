// POST /api/enrich
// Subject enrichment — runs GLEIF LEI chain lookup, SpiderFoot OSINT scan,
// and web-check domain intelligence in parallel for a given subject.
// All three are fail-soft: missing env vars or service errors return nulls
// for that provider without failing the whole request.
//
// Body: {
//   name: string,          — subject name (required)
//   lei?: string,          — 20-char LEI (for GLEIF chain)
//   domain?: string,       — domain to check (web-check)
//   enableOsint?: boolean, — set true to run SpiderFoot scan (slow, ~2min)
// }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { lookupLei, searchGleif } from "../../../../dist/src/integrations/gleif.js";
import { domainIntel } from "../../../../dist/src/integrations/webCheck.js";
import { spiderFootScan } from "../../../../dist/src/integrations/spiderfoot.js";
import { yenteMatch } from "../../../../dist/src/integrations/yente.js";
import { searchAdverseMedia } from "../../../../dist/src/integrations/taranisAi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface EnrichBody {
  name: string;
  lei?: string;
  domain?: string;
  enableOsint?: boolean;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: EnrichBody;
  try {
    body = (await req.json()) as EnrichBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400, headers: CORS });
  }

  const name = body.name.trim();

  // If no LEI provided, attempt to find one via GLEIF name search
  let resolvedLei = body.lei?.trim().toUpperCase();
  if (!resolvedLei) {
    const gleifSearch = await searchGleif(name, 3).catch(() => []);
    resolvedLei = gleifSearch[0]?.lei;
  }

  // Run all enrichment sources in parallel — all fail-soft
  const [gleifResult, domainResult, yenteResult, osintResult, adverseMediaResult] = await Promise.all([
    resolvedLei
      ? lookupLei(resolvedLei, { maxDepth: 5 }).catch(() => null)
      : Promise.resolve(null),
    body.domain
      ? domainIntel(body.domain).catch(() => null)
      : Promise.resolve(null),
    yenteMatch([{ name, schema: "LegalEntity" }]).catch(() => null),
    body.enableOsint && body.domain
      ? spiderFootScan(body.domain, { moduleSet: "passive", maxWaitMs: 90_000 }).catch(() => null)
      : Promise.resolve(null),
    searchAdverseMedia(name, { limit: 20, minRelevance: 0 }).catch(() => null),
  ]);

  const yenteTop = Array.isArray(yenteResult) ? yenteResult[0]?.hits[0] : null;

  return NextResponse.json(
    {
      ok: true,
      subject: name,
      gleif: gleifResult,
      domainIntel: domainResult,
      yente: yenteTop ? {
        score: yenteTop.score,
        caption: yenteTop.caption,
        datasets: yenteTop.datasets,
        schema: yenteTop.schema,
      } : null,
      osint: osintResult,
      adverseMedia: adverseMediaResult?.ok ? {
        totalCount: adverseMediaResult.totalCount,
        adverseCount: adverseMediaResult.adverseCount,
        highRelevanceCount: adverseMediaResult.highRelevanceCount,
        items: adverseMediaResult.items.slice(0, 10),
      } : null,
      enrichedAt: new Date().toISOString(),
    },
    { status: 200, headers: { ...CORS, ...gateHeaders } },
  );
}
