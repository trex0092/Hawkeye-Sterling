import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { MODULE_BOARDS, INBOX_BOARD, DIGEST_BOARD, boardName, boardProjectGid } from "@/lib/server/asana-workspace-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const API = "https://app.asana.com/api/1.0";

// Sections per board come from the canonical workspace map — the operator-
// approved 90-board topology (00 · Inbox + 88 module boards + HS · Modules
// digest, 2026-06-10 rebuild). Boards without a GID in the generated
// artifact (pre-bootstrap) are skipped: run /api/asana-bootstrap-workspace
// first, commit the artifact, then POST here to enforce section order.
const PROJECTS = [
  { gid: boardProjectGid("inbox") ?? "", name: INBOX_BOARD.name, sections: INBOX_BOARD.sections },
  ...MODULE_BOARDS.map((b) => ({ gid: boardProjectGid(b.key) ?? "", name: boardName(b), sections: b.sections })),
  { gid: boardProjectGid("digest") ?? "", name: DIGEST_BOARD.name, sections: DIGEST_BOARD.sections },
].filter(p => p.gid !== "") as Array<{ gid: string; name: string; sections: readonly string[] }>;

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" };
}

// Asana stores emoji without the U+FE0F variation selector and sometimes
// with different whitespace than what we define in PROJECTS. Normalise both
// sides before comparing so "⚠️  Hit" and "⚠ Hit" are treated as the same
// section and don't trigger a spurious delete+recreate cycle.
function normSection(name: string): string {
  return name
    .replace(/️/g, "")   // strip emoji variation selector
    .replace(/\s+/g, " ")     // collapse runs of whitespace to single space
    .trim();
}

async function getSections(token: string, projectGid: string): Promise<Array<{ gid: string; name: string }>> {
  const res = await fetch(`${API}/projects/${projectGid}/sections`, {
    headers: headers(token),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`getSections ${res.status}`);
  const json = await res.json().catch(() => ({})) as { data?: Array<{ gid: string; name: string }> };
  return json.data ?? [];
}

async function deleteSection(token: string, sectionGid: string): Promise<boolean> {
  const res = await fetch(`${API}/sections/${sectionGid}`, {
    method: "DELETE",
    headers: headers(token),
    signal: AbortSignal.timeout(8_000),
  });
  return res.ok;
}

async function createSection(token: string, projectGid: string, name: string): Promise<boolean> {
  const res = await fetch(`${API}/projects/${projectGid}/sections`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ data: { name } }),
    signal: AbortSignal.timeout(8_000),
  });
  return res.ok;
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "asana-rebuild-sections_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);
  const token = process.env["ASANA_TOKEN"];
  if (!token) {
    return NextResponse.json({
      ok: false,
      error: "ASANA_TOKEN environment variable is not set in Netlify.",
    }, { status: 503 , headers: gate.headers });
  }

  // Verify token
  const me = await fetch(`${API}/users/me`, {
    headers: headers(token),
    signal: AbortSignal.timeout(8_000),
  }).then((r) => r.ok ? r.json() : null).catch((err: unknown) => { console.warn("[hawkeye] asana-rebuild-sections fetch failed:", err); return null; }) as { data?: { name: string } } | null;

  if (!me?.data?.name) {
    return NextResponse.json({ ok: false, error: "ASANA_TOKEN is invalid or expired." }, { status: 401 , headers: gate.headers });
  }

  // Optional {offset, limit} body slices the 90-board sweep into short
  // calls that survive flaky proxies; no body = full sweep (idempotent).
  const body = await req.json().catch(() => ({})) as { offset?: number; limit?: number };
  const offset = Math.max(0, Math.floor(body.offset ?? 0));
  const limit = Math.min(Math.max(1, Math.floor(body.limit ?? PROJECTS.length)), PROJECTS.length);
  const SLICE = PROJECTS.slice(offset, offset + limit);

  const results: Array<{
    name: string;
    deleted: number;
    created: number;
    errors: string[];
  }> = [];

  // Process all projects in parallel — sequential + delays was ~120s which
  // exceeded the function timeout. Parallel brings it to ~5-10s.
  const CHUNK = 8;
  const projectResults: Array<{ name: string; deleted: number; created: number; errors: string[] }> = [];
  for (let c = 0; c < SLICE.length; c += CHUNK) {
  const chunkResults = await Promise.all(
    SLICE.slice(c, c + CHUNK).map(async (project) => {
      const errors: string[] = [];
      let deleted = 0;
      let created = 0;
      try {
        const existing = await getSections(token, project.gid);
        const desiredNorms = new Set(project.sections.map(normSection));
        // Track normalised names that survive (delete rejected by Asana) so we
        // don't try to re-create them and hit a 400 duplicate-name error.
        const survivingNorms = new Set<string>();
        for (const sec of existing) {
          const secNorm = normSection(sec.name);
          try {
            const ok = await deleteSection(token, sec.gid);
            if (ok) {
              deleted++;
            } else {
              survivingNorms.add(secNorm);
              // Only report an error when we WANTED to remove the section
              // (i.e. it isn't in the desired list). If it's already the
              // correct section name (emoji-normalised), the "delete failed"
              // is irrelevant — the section is in the right state.
              if (!desiredNorms.has(secNorm)) {
                errors.push(`delete:${sec.name}`);
              }
            }
          } catch {
            survivingNorms.add(secNorm);
            if (!desiredNorms.has(secNorm)) {
              errors.push(`delete:${sec.name}`);
            }
          }
          await delay(50);
        }
        await delay(200);
        for (const sectionName of project.sections) {
          if (survivingNorms.has(normSection(sectionName))) {
            // Section already exists with the right name — count as success.
            created++;
            continue;
          }
          try {
            const ok = await createSection(token, project.gid, sectionName);
            if (ok) created++;
            else errors.push(`create:${sectionName}`);
          } catch {
            errors.push(`create:${sectionName}`);
          }
          await delay(50);
        }
      } catch (err) {
        console.error(`[asana-rebuild-sections] project processing failed for ${project.name}:`, err);
        errors.push("project processing failed — see server logs");
      }
      return { name: project.name, deleted, created, errors };
    }),
  );
  projectResults.push(...chunkResults);
  }
  results.push(...projectResults);

  const allOk = results.every((r) => r.errors.length === 0);
  return NextResponse.json({
    ok: allOk,
    authenticatedAs: me.data.name,
    offset,
    limit,
    total: PROJECTS.length,
    results,
  }, { headers: gate.headers });
}
