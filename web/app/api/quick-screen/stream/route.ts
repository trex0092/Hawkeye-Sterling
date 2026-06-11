// POST /api/quick-screen/stream
//
// Streams screening pipeline progress as Server-Sent Events (SSE).
// Accepts the same body as /api/quick-screen but emits stage events
// as each part of the pipeline completes, so the client sees live
// progress rather than waiting for the full result.
//
// SSE event format: data: ${JSON.stringify(event)}\n\n
//
// Event stages:
//   started            — pipeline initiated
//   sanctions_check    — running / complete (with hitCount, durationMs)
//   news_aggregation   — running / complete (with articleCount)
//   pep_check          — running / complete (with isPep)
//   complete           — final result (severity, hits, durationMs)
//   error              — pipeline error

import { enforce } from "@/lib/server/enforce";
import { loadCandidatesWithHealth } from "@/lib/server/candidates-loader";
import type {
  QuickScreenCandidate,
  QuickScreenOptions,
  QuickScreenSubject,
} from "@/lib/api/quickScreen.types";
import { quickScreen as brainQuickScreen } from "@brain/quick-screen.js";
import { searchAllNews } from "@/lib/intelligence/newsAdapters";
import { enrichPepFromWikidata } from "@/lib/intelligence/wikidata-pep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type QuickScreenFn = (
  _subject: QuickScreenSubject,
  _candidates: QuickScreenCandidate[],
  _options?: QuickScreenOptions,
) => ReturnType<typeof brainQuickScreen>;
const quickScreen = brainQuickScreen as QuickScreenFn;

interface StreamRequestBody {
  subject?: QuickScreenSubject;
  subjects?: QuickScreenSubject[];
  candidates?: QuickScreenCandidate[];
  options?: QuickScreenOptions;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export async function POST(req: Request): Promise<Response> {
  const gate = await enforce(req, { requireAuth: true, cost: 2 });
  if (!gate.ok) return gate.response;

  let body: StreamRequestBody;
  try {
    body = (await req.json()) as StreamRequestBody;
  } catch {
    return new Response(
      `data: ${JSON.stringify({ stage: "error", message: "invalid JSON body" })}\n\n`,
      { status: 400, headers: SSE_HEADERS },
    );
  }

  const rawSubject = body.subject ?? (Array.isArray(body.subjects) ? body.subjects[0] : undefined);
  if (!rawSubject || typeof rawSubject.name !== "string" || !rawSubject.name.trim()) {
    return new Response(
      `data: ${JSON.stringify({ stage: "error", message: "subject.name required" })}\n\n`,
      { status: 400, headers: SSE_HEADERS },
    );
  }
  if (rawSubject.name.length > 512) {
    return new Response(
      `data: ${JSON.stringify({ stage: "error", message: "subject.name exceeds 512-character limit" })}\n\n`,
      { status: 400, headers: SSE_HEADERS },
    );
  }

  const subject: QuickScreenSubject = {
    ...rawSubject,
    name: rawSubject.name.trim(),
  };

  // Snapshot caller candidates before the stream starts (body cannot be re-read later)
  const callerCandidates = Array.isArray(body.candidates) ? body.candidates : null;
  const options = body.options;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encode = (event: object): Uint8Array =>
        new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);

      const enqueue = (event: object): void => {
        try {
          controller.enqueue(encode(event));
        } catch {
          // Client disconnected — silently ignore
        }
      };

      const t0 = Date.now();

      try {
        // ── started ────────────────────────────────────────────────────────
        enqueue({
          stage: "started",
          subject: subject.name,
          timestamp: new Date().toISOString(),
        });

        // ── sanctions_check ────────────────────────────────────────────────
        enqueue({ stage: "sanctions_check", status: "running" });
        const sanctionsT0 = Date.now();

        let candidates: QuickScreenCandidate[];
        if (callerCandidates !== null) {
          candidates = callerCandidates;
        } else {
          const loaded = await loadCandidatesWithHealth().catch(() => null);
          if (!loaded) {
            enqueue({ stage: "error", message: "watchlist corpus unavailable" });
            controller.close();
            return;
          }
          const raw = loaded.candidates;
          if (!Array.isArray(raw) || raw.length === 0) {
            enqueue({ stage: "error", message: "watchlist corpus empty" });
            controller.close();
            return;
          }
          candidates = raw.filter(
            (c): c is QuickScreenCandidate =>
              !!c &&
              typeof c === "object" &&
              typeof (c as QuickScreenCandidate).listId === "string" &&
              typeof (c as QuickScreenCandidate).name === "string",
          );
        }

        const screenResult = quickScreen(subject, candidates, options);
        const sanctionsDurationMs = Date.now() - sanctionsT0;

        enqueue({
          stage: "sanctions_check",
          status: "complete",
          hitCount: screenResult.hits.length,
          durationMs: sanctionsDurationMs,
        });

        // ── news_aggregation ───────────────────────────────────────────────
        enqueue({ stage: "news_aggregation", status: "running" });

        type NewsResult = Awaited<ReturnType<typeof searchAllNews>>;
        let newsResult: NewsResult = { articles: [], providersUsed: [] };
        if (subject.name.length >= 3) {
          newsResult = await searchAllNews(subject.name, { limit: 20 }).catch(
            (): NewsResult => ({ articles: [], providersUsed: [] }),
          );
        }

        enqueue({
          stage: "news_aggregation",
          status: "complete",
          articleCount: newsResult.articles.length,
        });

        // ── pep_check ──────────────────────────────────────────────────────
        enqueue({ stage: "pep_check", status: "running" });

        const pepProfiles = await enrichPepFromWikidata(subject.name).catch(() => []);
        const isPep = pepProfiles.length > 0;

        enqueue({ stage: "pep_check", status: "complete", isPep });

        // ── complete ───────────────────────────────────────────────────────
        enqueue({
          stage: "complete",
          severity: screenResult.severity,
          hits: screenResult.hits,
          durationMs: Date.now() - t0,
        });
      } catch (err) {
        enqueue({
          stage: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { ...SSE_HEADERS, ...gate.headers } });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin":
        process.env["NEXT_PUBLIC_APP_URL"] ?? process.env["URL"] ?? "https://hawkeye-sterling.netlify.app",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization, x-api-key",
    },
  });
}
