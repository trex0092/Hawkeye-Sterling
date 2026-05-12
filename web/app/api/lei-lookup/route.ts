// POST /api/lei-lookup
// GLEIF LEI lookup — single record by LEI code or name search.
// Body: { lei?: string; legalName?: string }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

const CORS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const { searchParams } = new URL(req.url);
  const lei = searchParams.get("lei")?.trim();
  const legalName = searchParams.get("legalName")?.trim() ?? searchParams.get("name")?.trim();
  if (!lei && !legalName) {
    return NextResponse.json(
      { ok: false, error: "Provide ?lei=<20-char LEI> or ?legalName=<name>" },
      { status: 400, headers: CORS },
    );
  }
  if (lei) {
    if (lei.length !== 20) {
      return NextResponse.json({ ok: false, error: "LEI must be exactly 20 characters" }, { status: 400, headers: CORS });
    }
    const record = await fetchLeiRecord(lei);
    if (record) return NextResponse.json(record, { status: 200, headers: CORS });
    return NextResponse.json({ ok: false, error: "GLEIF API temporarily unreachable — please retry.", degraded: true }, { status: 503, headers: CORS });
  }
  const matches = await searchByName(legalName!);
  if (matches.length === 0) {
    return NextResponse.json({ ok: false, error: "No LEI found for that name", degraded: true }, { status: 404, headers: CORS });
  }
  const topMatch = matches[0]!;
  if (topMatch.lei) {
    const record = await fetchLeiRecord(topMatch.lei);
    if (record) return NextResponse.json(record, { status: 200, headers: CORS });
  }
  const minimal: LeiLookupResult = {
    ok: true,
    lei: topMatch.lei || "N/A",
    legalName: topMatch.legalName,
    jurisdiction: topMatch.jurisdiction,
    legalForm: "Unknown",
    status: (topMatch.status as LeiLookupResult["status"]) || "ISSUED",
    registrationStatus: topMatch.status || "ISSUED",
    headquartersAddress: "Not available",
    registeredAddress: "Not available",
    lastUpdated: new Date().toISOString(),
  };
  return NextResponse.json(minimal, { status: 200, headers: CORS });
}

export interface LeiLookupResult {
  ok: true;
  lei: string;
  legalName: string;
  jurisdiction: string;
  legalForm: string;
  status:
    | "ISSUED"
    | "LAPSED"
    | "RETIRED"
    | "PENDING_TRANSFER"
    | "PENDING_ARCHIVAL"
    | "DUPLICATE"
    | "ANNULLED"
    | "CANCELLED"
    | "MERGED"
    | "RETIRED";
  registrationStatus: string;
  headquartersAddress: string;
  registeredAddress: string;
  ultimateParent?: { lei: string; legalName: string; relationship: string };
  directParent?: { lei: string; legalName: string; relationship: string };
  lastUpdated: string;
}

// Fallback: Emirates NBD sample record (well-known UAE bank with public LEI)
const UAE_BANK_FALLBACK: LeiLookupResult = {
  ok: true,
  lei: "529900S0LYEQVTRP7C22",
  legalName: "Emirates NBD Bank PJSC",
  jurisdiction: "AE",
  legalForm: "Public Joint Stock Company",
  status: "ISSUED",
  registrationStatus: "ISSUED",
  headquartersAddress: "Baniyas Road, Deira, P.O. Box 777, Dubai, United Arab Emirates",
  registeredAddress: "Baniyas Road, Deira, P.O. Box 777, Dubai, United Arab Emirates",
  ultimateParent: {
    lei: "254900ICTBKL7ZHCQF72",
    legalName: "Investment Corporation of Dubai",
    relationship: "IS_ULTIMATELY_CONSOLIDATED_BY",
  },
  directParent: {
    lei: "254900ICTBKL7ZHCQF72",
    legalName: "Investment Corporation of Dubai",
    relationship: "IS_DIRECTLY_CONSOLIDATED_BY",
  },
  lastUpdated: "2025-01-15T08:00:00Z",
};

// ── GLEIF API helpers ──────────────────────────────────────────────────────

interface GleifLeiRecord {
  data?: {
    LEI?: string;
    attributes?: {
      lei?: string;
      entity?: {
        legalName?: { name?: string };
        jurisdiction?: string;
        legalForm?: { id?: string };
        legalAddress?: {
          addressLines?: string[];
          city?: string;
          country?: string;
          postalCode?: string;
        };
        headquartersAddress?: {
          addressLines?: string[];
          city?: string;
          country?: string;
          postalCode?: string;
        };
        status?: string;
      };
      registration?: {
        status?: string;
        lastUpdateDate?: string;
      };
    };
    relationships?: {
      "ultimate-parent"?: {
        data?: { id?: string };
        links?: { "relationship-record"?: string };
      };
      "direct-parent"?: {
        data?: { id?: string };
        links?: { "relationship-record"?: string };
      };
    };
  };
}

function formatGleifAddress(addr?: {
  addressLines?: string[];
  city?: string;
  country?: string;
  postalCode?: string;
}): string {
  if (!addr) return "Not available";
  const parts = [
    ...(addr.addressLines ?? []),
    addr.city,
    addr.postalCode,
    addr.country,
  ].filter(Boolean);
  return parts.join(", ") || "Not available";
}

async function fetchLeiRecord(lei: string): Promise<LeiLookupResult | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(`https://api.gleif.org/api/v1/lei-records/${encodeURIComponent(lei)}`, {
        headers: { accept: "application/vnd.api+json" },
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const raw = (await res.json()) as GleifLeiRecord;
      const d = raw.data;
      if (!d?.attributes) return null;
      const attr = d.attributes;
      const entity = attr.entity;
      const reg = attr.registration;

      const statusRaw = (entity?.status ?? reg?.status ?? "ISSUED").toUpperCase();
      const validStatuses = new Set([
        "ISSUED", "LAPSED", "RETIRED", "PENDING_TRANSFER", "PENDING_ARCHIVAL",
        "DUPLICATE", "ANNULLED", "CANCELLED", "MERGED",
      ]);
      const status = (validStatuses.has(statusRaw) ? statusRaw : "ISSUED") as LeiLookupResult["status"];

      const record: LeiLookupResult = {
        ok: true,
        lei: attr.lei ?? lei,
        legalName: entity?.legalName?.name ?? "Unknown",
        jurisdiction: entity?.jurisdiction ?? "Unknown",
        legalForm: entity?.legalForm?.id ?? "Unknown",
        status,
        registrationStatus: reg?.status ?? status,
        headquartersAddress: formatGleifAddress(entity?.headquartersAddress),
        registeredAddress: formatGleifAddress(entity?.legalAddress),
        lastUpdated: reg?.lastUpdateDate ?? new Date().toISOString(),
      };

      // Try to resolve parent LEIs (best-effort, don't fail if missing)
      const relships = d.relationships;
      if (relships?.["direct-parent"]?.data?.id) {
        const parentLei = relships["direct-parent"].data.id;
        const parentRecord = await fetchLeiRecord(parentLei).catch((err: unknown) => { console.warn("[hawkeye] lei-lookup parent-record fetch failed:", err); return null; });
        if (parentRecord) {
          record.directParent = {
            lei: parentLei,
            legalName: parentRecord.legalName,
            relationship: "IS_DIRECTLY_CONSOLIDATED_BY",
          };
        }
      }
      if (relships?.["ultimate-parent"]?.data?.id) {
        const uParentLei = relships["ultimate-parent"].data.id;
        if (uParentLei !== relships?.["direct-parent"]?.data?.id) {
          const uParentRecord = await fetchLeiRecord(uParentLei).catch((err: unknown) => { console.warn("[hawkeye] lei-lookup parent-record fetch failed:", err); return null; });
          if (uParentRecord) {
            record.ultimateParent = {
              lei: uParentLei,
              legalName: uParentRecord.legalName,
              relationship: "IS_ULTIMATELY_CONSOLIDATED_BY",
            };
          }
        } else if (record.directParent) {
          record.ultimateParent = {
            ...record.directParent,
            relationship: "IS_ULTIMATELY_CONSOLIDATED_BY",
          };
        }
      }

      return record;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

interface GleifFuzzyResponse {
  data?: Array<{
    lei?: string;
    name?: string;
    jurisdiction?: string;
    status?: string;
  }>;
}

async function searchByName(
  name: string,
): Promise<Array<{ lei: string; legalName: string; jurisdiction: string; status: string }>> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6_000);
    try {
      const url = `https://api.gleif.org/api/v1/fuzzycompletions?field=entity.legalName&q=${encodeURIComponent(name)}&pageSize=5`;
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) return [];
      const data = (await res.json()) as GleifFuzzyResponse;
      return (data.data ?? []).map((d) => ({
        lei: d.lei ?? "",
        legalName: d.name ?? "",
        jurisdiction: d.jurisdiction ?? "",
        status: d.status ?? "",
      }));
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return [];
  }
}

// ── Main handler ───────────────────────────────────────────────────────────

interface LeiLookupBody {
  lei?: string;
  legalName?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: LeiLookupBody;
  try {
    body = (await req.json()) as LeiLookupBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: CORS },
    );
  }

  const lei = body.lei?.trim();
  const legalName = body.legalName?.trim();

  if (!lei && !legalName) {
    return NextResponse.json(
      { ok: false, error: "lei or legalName is required" },
      { status: 400, headers: CORS },
    );
  }

  // Direct LEI lookup
  if (lei) {
    if (lei.length !== 20) {
      return NextResponse.json(
        { ok: false, error: "LEI must be exactly 20 characters" },
        { status: 400, headers: CORS },
      );
    }
    const record = await fetchLeiRecord(lei);
    if (record) {
      return NextResponse.json(record, { status: 200, headers: CORS });
    }
    // GLEIF API unreachable — return degraded response rather than misleading static data
    return NextResponse.json(
      {
        ok: false,
        error: "GLEIF API temporarily unreachable — please retry in a few seconds.",
        degraded: true,
      },
      { status: 503, headers: CORS },
    );
  }

  // Name search — return first match as full record
  const matches = await searchByName(legalName!);
  if (matches.length === 0) {
    // Return fallback
    return NextResponse.json({ ok: false, error: "lei-lookup temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }

  const topMatch = matches[0]!;
  if (topMatch.lei) {
    const record = await fetchLeiRecord(topMatch.lei);
    if (record) {
      return NextResponse.json(record, { status: 200, headers: CORS });
    }
  }

  // Build minimal record from fuzzy completion data
  const minimal: LeiLookupResult = {
    ok: true,
    lei: topMatch.lei || "N/A",
    legalName: topMatch.legalName,
    jurisdiction: topMatch.jurisdiction,
    legalForm: "Unknown",
    status: (topMatch.status as LeiLookupResult["status"]) || "ISSUED",
    registrationStatus: topMatch.status || "ISSUED",
    headquartersAddress: "Not available",
    registeredAddress: "Not available",
    lastUpdated: new Date().toISOString(),
  };

  return NextResponse.json(minimal, { status: 200, headers: CORS });
}
