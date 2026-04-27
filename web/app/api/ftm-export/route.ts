// GET /api/ftm-export — export case entities in FollowTheMoney (FTM) JSON format.
// FTM is the open data model used by OCCRP Aleph and similar investigative tools.
// https://followthemoney.tech/explorer/

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { loadCases } from "@/lib/data/case-store";
import type { CaseRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface FtmEntity {
  id: string;
  schema: string;
  properties: Record<string, string[]>;
  datasets: string[];
  referents: string[];
}

function caseToFtm(c: CaseRecord): FtmEntity[] {
  const entities: FtmEntity[] = [];
  const entityId = `hs-case-${c.id}`;

  // Main entity — Legal investigation case
  const entity: FtmEntity = {
    id: entityId,
    schema: "LegalEntity",
    properties: {
      name: [c.subject],
      notes: [`${c.badge} · ${c.statusLabel} — ${c.statusDetail}`],
      createdAt: [c.opened],
      modifiedAt: [c.lastActivity],
    },
    datasets: ["hawkeye-sterling"],
    referents: [],
  };
  if (c.meta) entity.properties["description"] = [c.meta];
  if (c.mlroDisposition) entity.properties["mlroDisposition"] = [c.mlroDisposition];
  if (c.goAMLReference) entity.properties["externalRef"] = [c.goAMLReference];

  entities.push(entity);

  // Evidence links
  for (const ev of c.evidence ?? []) {
    const docId = `hs-ev-${c.id}-${Math.random().toString(36).slice(2)}`;
    entities.push({
      id: docId,
      schema: "Document",
      properties: {
        name: [ev.title ?? "Evidence"],
        description: [ev.detail ?? ev.meta ?? ""],
        category: [ev.category ?? ""],
        parent: [entityId],
      },
      datasets: ["hawkeye-sterling"],
      referents: [entityId],
    });
  }

  return entities;
}

async function handleFtmExport(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10)), 1_000) : 500;

  const cases = loadCases();
  const filtered = statusFilter
    ? cases.filter((c) => c.status === statusFilter)
    : cases;
  const slice = filtered.slice(0, limit);

  const entities = slice.flatMap(caseToFtm);

  // FTM bulk format: one JSON object per line (NDJSON)
  const ndjson = entities.map((e) => JSON.stringify(e)).join("\n");

  return new NextResponse(ndjson, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson",
      "content-disposition": `attachment; filename="hawkeye-sterling-ftm-${new Date().toISOString().slice(0, 10)}.ndjson"`,
      "x-entity-count": String(entities.length),
      "x-case-count": String(slice.length),
    },
  });
}

export const GET = withGuard(handleFtmExport);
