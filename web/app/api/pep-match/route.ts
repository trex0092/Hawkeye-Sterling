export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

// OpenSanctions PEP matching proxy.
// POST /api/pep-match  { name, birthYear?, aliases? }
// → { ok: true, hits: PepMatchHit[], source: "opensanctions" | "none" }
//
// Requires OPENSANCTIONS_API_KEY env var (non-commercial free key from
// https://www.opensanctions.org/api/).  Without a key the route returns
// an empty hits array so the form degrades gracefully.

export interface PepMatchHit {
  id: string;
  name: string;
  score: number; // 0..1 — OpenSanctions match score
  positions: string[];
  countries: string[];
  topics: string[]; // includes "role.pep", "role.rca", "sanction", etc.
  birthDate?: string;
  datasets: string[]; // source dataset names
  caption: string; // human-readable label from OpenSanctions
}

export interface PepMatchResponse {
  ok: boolean;
  hits: PepMatchHit[];
  source: "opensanctions" | "none";
  queriedName: string;
  error?: string;
}

interface OsProperty {
  [key: string]: string[] | undefined;
}

interface OsResult {
  id?: string;
  caption?: string;
  score?: number;
  properties?: OsProperty;
  datasets?: string[];
  match?: boolean;
}

interface OsMatchResponse {
  responses?: {
    [queryKey: string]: {
      results?: OsResult[];
      total?: { value?: number };
    };
  };
}

const OS_MATCH_URL = "https://api.opensanctions.org/match/peps";
const MATCH_TIMEOUT_MS = 8_000;
const MIN_SCORE = 0.55;

export async function POST(req: Request): Promise<NextResponse> {
  let body: { name?: string; birthYear?: string | number; aliases?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, hits: [], source: "none", queriedName: "", error: "Invalid JSON" } satisfies PepMatchResponse, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (name.length < 2) {
    return NextResponse.json({ ok: true, hits: [], source: "none", queriedName: name } satisfies PepMatchResponse);
  }

  const apiKey = process.env["OPENSANCTIONS_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: true, hits: [], source: "none", queriedName: name } satisfies PepMatchResponse);
  }

  // Build the OpenSanctions matching query.
  const queryProps: Record<string, string[]> = { name: [name] };
  if (body.birthYear) queryProps["birthDate"] = [String(body.birthYear)];
  if (body.aliases && body.aliases.length > 0) {
    queryProps["name"] = [name, ...body.aliases.slice(0, 3)];
  }

  const payload = {
    queries: {
      q1: {
        schema: "Person",
        properties: queryProps,
      },
    },
  };

  try {
    const res = await fetch(OS_MATCH_URL, {
      method: "POST",
      signal: AbortSignal.timeout(MATCH_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        Authorization: `ApiKey ${apiKey}`,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, hits: [], source: "none", queriedName: name, error: `OpenSanctions ${res.status}: ${errText.slice(0, 120)}` } satisfies PepMatchResponse,
        { status: 502 },
      );
    }

    const data = (await res.json()) as OsMatchResponse;
    const results = data.responses?.["q1"]?.results ?? [];

    const hits: PepMatchHit[] = results
      .filter((r): r is OsResult & { id: string; caption: string } => !!r.id && !!r.caption && (r.score ?? 0) >= MIN_SCORE)
      .map((r) => {
        const props = r.properties ?? {};
        return {
          id: r.id,
          caption: r.caption,
          name: (props["name"]?.[0]) ?? r.caption,
          score: r.score ?? 0,
          positions: props["position"] ?? props["title"] ?? [],
          countries: props["country"] ?? props["nationality"] ?? [],
          topics: props["topics"] ?? [],
          birthDate: props["birthDate"]?.[0],
          datasets: r.datasets ?? [],
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return NextResponse.json({ ok: true, hits, source: "opensanctions", queriedName: name } satisfies PepMatchResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, hits: [], source: "none", queriedName: name, error: msg } satisfies PepMatchResponse, { status: 502 });
  }
}
