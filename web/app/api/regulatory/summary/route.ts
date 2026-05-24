// GET /api/regulatory/summary
//
// Returns a catalogue of all regulatory filing capabilities supported by
// Hawkeye Sterling. Used by the /regulatory-filing page and any API consumers
// that need to discover which jurisdictions and report types are available.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

interface JurisdictionEntry {
  code: string;
  name: string;
  reportTypes: string[];
  format: "XML" | "JSON";
  endpoint: string;
}

interface SummaryResponse {
  jurisdictions: JurisdictionEntry[];
  generatedAt: string;
}

const JURISDICTIONS: JurisdictionEntry[] = [
  {
    code: "AU",
    name: "Australia - AUSTRAC",
    reportTypes: ["SMR", "TTR"],
    format: "XML",
    endpoint: "/api/regulatory/austrac",
  },
  {
    code: "CA",
    name: "Canada - FINTRAC",
    reportTypes: ["STR", "LCT", "EFT"],
    format: "XML",
    endpoint: "/api/regulatory/fintrac",
  },
  {
    code: "SG",
    name: "Singapore - MAS",
    reportTypes: ["STR"],
    format: "JSON",
    endpoint: "/api/regulatory/mas",
  },
  {
    code: "AE",
    name: "UAE - DFSA",
    reportTypes: ["STR"],
    format: "XML",
    endpoint: "/api/regulatory/dfsa",
  },
  {
    code: "INT",
    name: "goAML (UN/FATF)",
    reportTypes: ["STR", "SAR"],
    format: "XML",
    endpoint: "/api/reports/goaml",
  },
];

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const summary: SummaryResponse = {
    jurisdictions: JURISDICTIONS,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(summary, {
    status: 200,
    headers: {
      ...gate.headers,
      "cache-control": "no-store",
    },
  });
}
