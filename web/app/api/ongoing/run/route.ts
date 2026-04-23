import { NextResponse } from "next/server";
// Import from the concrete module, not the index barrel — see super-brain
// route for why pulling in the 80-module barrel at cold-start kills these
// Netlify Functions with 502s.
import { quickScreen } from "../../../../../dist/src/brain/quick-screen.js";
import { CANDIDATES } from "@/lib/data/candidates";
import { getJson, listKeys, setJson } from "@/lib/server/store";
import { postWebhook } from "@/lib/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EnrolledSubject {
  id: string;
  name: string;
  aliases?: string[];
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  group?: string;
  caseId?: string;
  enrolledAt: string;
}

interface LastHit {
  listRef: string;
  candidateName: string;
  score: number;
}

interface LastSnapshot {
  runAt: string;
  topScore: number;
  severity: string;
  hits: LastHit[];
}

function fingerprints(hits: LastHit[]): Set<string> {
  return new Set(hits.map((h) => `${h.listRef}|${h.candidateName}`));
}

export async function POST(req: Request): Promise<NextResponse> {
  // Optional bearer token protection for manual invocations.
  const expected = process.env["ONGOING_RUN_TOKEN"];
  if (expected) {
    const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (got !== expected) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const keys = await listKeys("ongoing/subject/");
  const subjects: EnrolledSubject[] = [];
  for (const key of keys) {
    const s = await getJson<EnrolledSubject>(key);
    if (s) subjects.push(s);
  }

  const runAt = new Date().toISOString();
  const results: Array<{
    subjectId: string;
    subjectName: string;
    topScore: number;
    severity: string;
    newHits: Array<{ listId: string; listRef: string; candidateName: string }>;
    webhook: Awaited<ReturnType<typeof postWebhook>>;
    asanaTaskUrl?: string;
  }> = [];

  for (const s of subjects) {
    try {
      const subject = {
        name: s.name,
        ...(s.aliases && s.aliases.length ? { aliases: s.aliases } : {}),
        ...(s.entityType ? { entityType: s.entityType } : {}),
        ...(s.jurisdiction ? { jurisdiction: s.jurisdiction } : {}),
      };
      const screen = quickScreen(
        subject,
        CANDIDATES as Parameters<typeof quickScreen>[1],
      );
      const prev = await getJson<LastSnapshot>(`ongoing/last/${s.id}`);
      const prevFps = prev ? fingerprints(prev.hits) : new Set<string>();
      const newHits = screen.hits.filter(
        (h) => !prevFps.has(`${h.listRef}|${h.candidateName}`),
      );

      // Persist the fresh snapshot.
      const snapshot: LastSnapshot = {
        runAt,
        topScore: screen.topScore,
        severity: screen.severity,
        hits: screen.hits.map((h) => ({
          listRef: h.listRef,
          candidateName: h.candidateName,
          score: h.score,
        })),
      };
      await setJson(`ongoing/last/${s.id}`, snapshot);

      let asanaTaskUrl: string | undefined;
      // Post a delta task to Asana ONLY when something new appears — avoids
      // flooding the board on every rerun.
      if (newHits.length > 0) {
        try {
          const asanaRes = await fetch(
            new URL(
              "/api/screening-report",
              req.url,
            ).toString(),
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                subject: {
                  id: s.id,
                  name: s.name,
                  aliases: s.aliases,
                  entityType: s.entityType,
                  jurisdiction: s.jurisdiction,
                  group: s.group,
                  caseId: s.caseId,
                  ongoingScreening: true,
                },
                result: { ...screen, hits: newHits },
                trigger: "ongoing",
              }),
            },
          );
          const payload = (await asanaRes.json().catch(() => null)) as
            | { taskUrl?: string }
            | null;
          if (payload?.taskUrl) asanaTaskUrl = payload.taskUrl;
        } catch {
          /* continue without Asana */
        }
      }

      const webhook = await postWebhook({
        type: newHits.length > 0 ? "screening.delta" : "ongoing.rerun",
        subjectId: s.id,
        subjectName: s.name,
        severity: screen.severity,
        topScore: screen.topScore,
        newHits: newHits.map((h) => ({
          listId: h.listId,
          listRef: h.listRef,
          candidateName: h.candidateName,
        })),
        ...(asanaTaskUrl ? { asanaTaskUrl } : {}),
        generatedAt: runAt,
        source: "hawkeye-sterling",
      });

      results.push({
        subjectId: s.id,
        subjectName: s.name,
        topScore: screen.topScore,
        severity: screen.severity,
        newHits: newHits.map((h) => ({
          listId: h.listId,
          listRef: h.listRef,
          candidateName: h.candidateName,
        })),
        webhook,
        ...(asanaTaskUrl ? { asanaTaskUrl } : {}),
      });
    } catch (err) {
      results.push({
        subjectId: s.id,
        subjectName: s.name,
        topScore: 0,
        severity: "error",
        newHits: [],
        webhook: {
          delivered: false,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    runAt,
    total: subjects.length,
    withNewHits: results.filter((r) => r.newHits.length > 0).length,
    results,
  });
}
