// /admin/sanctions
//
// Web-only admin dashboard for sanctions ingestion. Lets MLROs:
//   1. See current per-list freshness (recordCount, ageHours, status)
//   2. See the most recent adapter failures from the ingest-error log
//   3. Click "Refresh now" to force-run runIngestionAll() in-process
//
// Auth: standard portal session via enforce().

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface IngestRunSummary {
  ok: boolean;
  at: string;
  durationMs: number;
  ok_count: number;
  failed_count: number;
  anyWriteFailed: boolean;
  summary: Array<{
    listId: string;
    sourceUrl: string;
    recordCount: number;
    durationMs: number;
    errors: string[];
  }>;
}

interface IngestErrorEntry {
  at: string;
  source: string;
  adapterId: string;
  phase: "fetch" | "parse" | "write" | "verify";
  message: string;
  httpStatus?: number;
}

interface SanctionsStatusList {
  listId: string;
  displayName: string;
  present: boolean;
  entityCount: number | null;
  ageHours: number | null;
  status: string;
}

// ─── Server-side fetch helpers ───────────────────────────────────────────────

function baseUrl(headersList: Headers): string {
  const host = headersList.get("host") ?? "hawkeye-sterling.netlify.app";
  const proto = headersList.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

async function loadStatus(headersList: Headers): Promise<SanctionsStatusList[]> {
  try {
    const res = await fetch(`${baseUrl(headersList)}/api/sanctions/status`, {
      cache: "no-store",
      headers: { cookie: headersList.get("cookie") ?? "" },
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { lists?: SanctionsStatusList[] };
    return j.lists ?? [];
  } catch {
    return [];
  }
}

async function loadRecentErrors(headersList: Headers): Promise<IngestErrorEntry[]> {
  try {
    const res = await fetch(`${baseUrl(headersList)}/api/sanctions/last-errors?limit=20`, {
      cache: "no-store",
      headers: { cookie: headersList.get("cookie") ?? "" },
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { entries?: IngestErrorEntry[] };
    return j.entries ?? [];
  } catch {
    return [];
  }
}

// ─── Server Action: force a refresh ──────────────────────────────────────────
// Dynamic-imports runIngestionAll from the compiled brain output and calls
// it directly in-process. Bypasses the self-fetch path (Netlify Lambdas
// can't reliably TLS-handshake back to their own public origin).
//
// IMPORTANT: redirect() must NOT be called inside a try/catch — it throws
// a NEXT_REDIRECT control-flow exception that catch would erroneously
// handle as a real error (the "Error: NEXT_REDIRECT" banner). Pattern:
// try only the work, redirect at the function tail.
async function triggerRefresh(): Promise<void> {
  "use server";
  let outcome: { ok: true; result: IngestRunSummary } | { ok: false; message: string };
  try {
    const mod = (await import(
      "../../../../dist/src/ingestion/run-all.js" as string
    )) as { runIngestionAll: (label: string) => Promise<IngestRunSummary> };
    const result = await mod.runIngestionAll("admin-ui-trigger");
    outcome = { ok: true, result };
  } catch (err) {
    outcome = { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  // Redirects are at the TOP LEVEL — outside any try/catch.
  if (!outcome.ok) {
    return redirect(`/admin/sanctions?error=${encodeURIComponent(outcome.message)}`);
  }
  return redirect(
    `/admin/sanctions?refreshed=${encodeURIComponent(JSON.stringify(outcome.result))}`,
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function AdminSanctionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ refreshed?: string; error?: string }>;
}) {
  const headersList = await headers();
  const req = new Request(`${baseUrl(headersList)}/admin/sanctions`, { headers: headersList });
  const gate = await enforce(req);
  if (!gate.ok) {
    return redirect("/login?next=/admin/sanctions");
  }

  const [statusLists, recentErrors] = await Promise.all([
    loadStatus(headersList),
    loadRecentErrors(headersList),
  ]);
  const params = (await searchParams) ?? {};
  let lastResult: IngestRunSummary | null = null;
  try {
    if (params.refreshed) lastResult = JSON.parse(params.refreshed) as IngestRunSummary;
  } catch {
    lastResult = null;
  }
  const lastError = params.error ?? null;

  return (
    <div style={{ maxWidth: 980, margin: "32px auto", padding: "0 24px", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Sanctions ingestion — admin</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Manual control panel. The 15-minute scheduled cron handles routine
        refresh in the background; use this page to diagnose or force a
        run on demand.
      </p>

      {lastError ? (
        <div style={{ padding: 12, marginBottom: 24, background: "#fee2e2", borderRadius: 6, color: "#991b1b" }}>
          <strong>Error:</strong> {lastError}
        </div>
      ) : null}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Current freshness</h2>
        {statusLists.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f4f4f5", textAlign: "left" }}>
                <th style={{ padding: 8 }}>List</th>
                <th style={{ padding: 8 }}>Records</th>
                <th style={{ padding: 8 }}>Age</th>
                <th style={{ padding: 8 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {statusLists.map((l) => (
                <tr key={l.listId} style={{ borderBottom: "1px solid #e4e4e7" }}>
                  <td style={{ padding: 8 }}>{l.displayName}</td>
                  <td style={{ padding: 8 }}>{l.entityCount ?? "—"}</td>
                  <td style={{ padding: 8 }}>{l.ageHours !== null ? `${l.ageHours} h` : "—"}</td>
                  <td style={{ padding: 8 }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 12,
                        background: l.status === "healthy" ? "#dcfce7" : l.status === "stale" ? "#fef3c7" : "#fee2e2",
                        color: l.status === "healthy" ? "#166534" : l.status === "stale" ? "#92400e" : "#991b1b",
                      }}
                    >
                      {l.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "#dc2626" }}>Could not load /api/sanctions/status.</p>
        )}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Force refresh</h2>
        <p style={{ color: "#666", marginBottom: 12 }}>
          Runs every adapter in parallel in-process. Each adapter has a
          12-second timeout. Total wall-clock typically 12-15 s.
        </p>
        <form action={triggerRefresh}>
          <button
            type="submit"
            style={{
              padding: "10px 20px",
              background: "#0f172a",
              color: "white",
              border: 0,
              borderRadius: 6,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Refresh now
          </button>
        </form>
      </section>

      {lastResult ? (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Last refresh result —{" "}
            <span style={{ color: lastResult.ok ? "#166534" : "#991b1b" }}>
              {lastResult.ok ? "OK" : "FAILED"}
            </span>
          </h2>
          <p style={{ color: "#666", marginBottom: 8, fontSize: 14 }}>
            {lastResult.at} · {lastResult.durationMs} ms ·{" "}
            ok={lastResult.ok_count} failed={lastResult.failed_count}
            {lastResult.anyWriteFailed ? " · write failures" : ""}
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f4f4f5", textAlign: "left" }}>
                <th style={{ padding: 8 }}>List</th>
                <th style={{ padding: 8 }}>Records</th>
                <th style={{ padding: 8 }}>Duration</th>
                <th style={{ padding: 8 }}>Errors</th>
              </tr>
            </thead>
            <tbody>
              {(lastResult.summary ?? []).map((r) => (
                <tr key={r.listId} style={{ borderBottom: "1px solid #e4e4e7" }}>
                  <td style={{ padding: 8 }}>{r.listId}</td>
                  <td style={{ padding: 8 }}>{r.recordCount}</td>
                  <td style={{ padding: 8 }}>{r.durationMs} ms</td>
                  <td style={{ padding: 8, color: r.errors.length ? "#991b1b" : "#666" }}>
                    {r.errors.length ? r.errors.join("; ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Recent ingest errors (last 20)</h2>
        {recentErrors.length === 0 ? (
          <p style={{ color: "#666" }}>No errors logged.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f4f4f5", textAlign: "left" }}>
                <th style={{ padding: 8 }}>At</th>
                <th style={{ padding: 8 }}>Source</th>
                <th style={{ padding: 8 }}>Adapter</th>
                <th style={{ padding: 8 }}>Phase</th>
                <th style={{ padding: 8 }}>HTTP</th>
                <th style={{ padding: 8 }}>Message</th>
              </tr>
            </thead>
            <tbody>
              {recentErrors.map((e, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #e4e4e7" }}>
                  <td style={{ padding: 8, fontSize: 12, color: "#666" }}>{e.at}</td>
                  <td style={{ padding: 8, fontSize: 12 }}>{e.source}</td>
                  <td style={{ padding: 8, fontSize: 12 }}>{e.adapterId}</td>
                  <td style={{ padding: 8, fontSize: 12 }}>{e.phase}</td>
                  <td style={{ padding: 8, fontSize: 12 }}>{e.httpStatus ?? "—"}</td>
                  <td style={{ padding: 8, fontSize: 12 }}>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
