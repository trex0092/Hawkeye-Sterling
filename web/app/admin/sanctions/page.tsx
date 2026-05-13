// /admin/sanctions
//
// Web-only admin dashboard for sanctions ingestion. Lets MLROs:
//   1. See current per-list freshness (recordCount, ageHours, status)
//   2. See the most recent adapter failures from the ingest-error log
//   3. Click "Refresh now" to force-run runIngestionAll() in-process
//
// Bypasses the scheduled-function lambda path entirely (which has been
// silently failing in production despite "Function invoked successfully"
// from Netlify). This page runs the same runIngestionAll() but inside
// the Next.js function lambda, which is known to work — so any error
// here is surfaced inline in the browser instead of swallowed by the
// scheduler.
//
// Auth: standard portal session via enforce().

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { enforce } from "@/lib/server/enforce";
import { runIngestionAll } from "../../../../src/ingestion/run-all";
import { listRecentIngestErrors } from "../../../../src/ingestion/error-log";

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
    checksum: string;
    fetchedAt: number;
    durationMs: number;
    errors: string[];
  }>;
}

// ─── Server Action: force a refresh ──────────────────────────────────────────
async function triggerRefresh(): Promise<IngestRunSummary> {
  "use server";
  return runIngestionAll("admin-ui-trigger") as Promise<IngestRunSummary>;
}

// ─── Helper: read sanctions/status JSON directly (no extra HTTP) ─────────────
async function loadSanctionsStatus(): Promise<{
  lists: Array<{
    listId: string;
    displayName: string;
    present: boolean;
    entityCount: number | null;
    ageHours: number | null;
    status: string;
  }>;
} | null> {
  try {
    const headersList = await headers();
    const host = headersList.get("host") ?? "hawkeye-sterling.netlify.app";
    const proto = headersList.get("x-forwarded-proto") ?? "https";
    const res = await fetch(`${proto}://${host}/api/sanctions/status`, {
      cache: "no-store",
      headers: { cookie: headersList.get("cookie") ?? "" },
    });
    if (!res.ok) return null;
    return (await res.json()) as Awaited<ReturnType<typeof loadSanctionsStatus>>;
  } catch {
    return null;
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function AdminSanctionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ refreshed?: string }>;
}) {
  // Auth gate. Reuses the standard portal session check.
  const req = new Request("http://localhost/admin/sanctions", {
    headers: await headers(),
  });
  const gate = await enforce(req);
  if (!gate.ok) {
    redirect("/login?next=/admin/sanctions");
  }

  const status = await loadSanctionsStatus();
  const recentErrors = await listRecentIngestErrors(20);
  const params = (await searchParams) ?? {};
  const lastResult: IngestRunSummary | null = params.refreshed
    ? (JSON.parse(decodeURIComponent(params.refreshed)) as IngestRunSummary)
    : null;

  return (
    <div style={{ maxWidth: 980, margin: "32px auto", padding: "0 24px", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Sanctions ingestion — admin</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Manual control panel. The 15-minute scheduled cron handles routine
        refresh in the background; use this page to diagnose or force a
        run on demand.
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Current freshness</h2>
        {status?.lists ? (
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
              {status.lists.map((l) => (
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
          Runs every adapter in parallel from this page. Each adapter has a
          12-second timeout. Total wall-clock typically 12-15 s.
        </p>
        <form
          action={async () => {
            "use server";
            const result = await triggerRefresh();
            // URL-encode the result and redirect so it shows after navigation.
            redirect(`/admin/sanctions?refreshed=${encodeURIComponent(JSON.stringify(result))}`);
          }}
        >
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
              {lastResult.summary.map((r) => (
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
