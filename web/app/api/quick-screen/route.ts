import { NextResponse } from "next/server";
import type {
  QuickScreenCandidate,
  QuickScreenOptions,
  QuickScreenResponse,
  QuickScreenResult,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";

// Compiled backend entry point. The root `tsc` build (npm run build at the repo root)
// must run before this API route is bundled. Netlify build order is encoded in
// netlify.toml; local dev runs `npm run build` at the root once to produce dist/.
import { quickScreen as brainQuickScreen } from "../../../../dist/src/brain/quick-screen.js";

type QuickScreenFn = (
  subject: QuickScreenSubject,
  candidates: QuickScreenCandidate[],
  options?: QuickScreenOptions,
) => QuickScreenResult;

const quickScreen = brainQuickScreen as QuickScreenFn;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QuickScreenRequestBody {
  subject?: QuickScreenSubject;
  candidates?: QuickScreenCandidate[];
  options?: QuickScreenOptions;
}

function respond(status: number, body: QuickScreenResponse): NextResponse {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: QuickScreenRequestBody;
  try {
    body = (await req.json()) as QuickScreenRequestBody;
  } catch {
    return respond(400, { ok: false, error: "invalid JSON body" });
  }

  const subject = body.subject;
  const candidates = body.candidates;

  if (!subject || typeof subject.name !== "string" || !subject.name.trim()) {
    return respond(400, { ok: false, error: "subject.name required" });
  }
  if (!Array.isArray(candidates)) {
    return respond(400, { ok: false, error: "candidates must be an array" });
  }

  try {
    const result = quickScreen(subject, candidates, body.options ?? {});
    return respond(200, { ok: true, ...result });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return respond(500, { ok: false, error: "quick-screen failed", detail });
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}
