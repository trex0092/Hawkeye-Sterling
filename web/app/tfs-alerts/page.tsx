"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { caughtErrorMessage } from "@/lib/client/error-utils";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";
import { ActionButton } from "@/components/shared/ActionButton";
import {
  loadAlerts,
  saveAlerts,
  upsertAlert,
  syncFromServer,
  parseAlertType,
  type TFSAlert,
  type TFSAlertStatus,
} from "@/lib/data/tfs-alert-store";

// ── Status badge config ───────────────────────────────────────────────────────

const STATUS_STYLE: Record<TFSAlertStatus, string> = {
  NEW: "bg-red-dim text-red",
  SCREENING_IN_PROGRESS: "bg-orange-dim text-orange",
  SCREENED: "bg-blue-dim text-blue",
  NO_MATCH: "bg-green-dim text-green",
  MATCH_FOUND: "bg-red-dim text-red font-bold",
  REPORTED: "bg-bg-2 text-ink-2",
};

const STATUS_LABEL: Record<TFSAlertStatus, string> = {
  NEW: "New",
  SCREENING_IN_PROGRESS: "Screening",
  SCREENED: "Screened",
  NO_MATCH: "No Match",
  MATCH_FOUND: "Match Found",
  REPORTED: "Reported",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Dubai",
    });
  } catch {
    return iso;
  }
}

function _fmtDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function csvEscape(val: string | null | undefined): string {
  const s = val ?? "";
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TFSAlertStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-10 font-semibold uppercase tracking-wide-2 ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── goAML Reference Modal ─────────────────────────────────────────────────────

function GoAMLModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (_ref: string) => void;
  onCancel: () => void;
}) {
  const [ref, setRef] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-panel border border-hair-2 rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 className="text-14 font-semibold text-ink-0 mb-1">Enter goAML Reference</h3>
        <p className="text-12 text-ink-2 mb-4">
          Enter the goAML report reference number to mark this alert as reported.
        </p>
        <input
          type="text"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="e.g. UAE-FIU-2026-12345"
          className="w-full border border-hair-2 rounded px-3 py-2 text-13 bg-bg-0 text-ink-0 focus:outline-none focus:border-brand mb-4"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && ref.trim()) onConfirm(ref.trim());
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 rounded text-12 text-ink-2 border border-hair-2 hover:bg-bg-1 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ref.trim()}
            onClick={() => onConfirm(ref.trim())}
            className="px-4 py-1.5 rounded text-12 text-ink-0 bg-brand hover:bg-brand-hover transition-colors disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Match Notes Modal ─────────────────────────────────────────────────────────

function MatchNotesModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (_notes: string) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-panel border border-hair-2 rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 className="text-14 font-semibold text-red mb-1">⚠️ Match Found — Record Details</h3>
        <p className="text-12 text-ink-2 mb-4">
          Record any notes about the match (customer name, account number, etc.). Freeze funds
          immediately and file via goAML within 5 business days.
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Customer: John Doe, Account: AE12345..."
          rows={4}
          className="w-full border border-hair-2 rounded px-3 py-2 text-13 bg-bg-0 text-ink-0 focus:outline-none focus:border-red mb-4 resize-none"
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 rounded text-12 text-ink-2 border border-hair-2 hover:bg-bg-1 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(notes.trim())}
            className="px-4 py-1.5 rounded text-12 text-white bg-red hover:opacity-90 transition-opacity"
          >
            Confirm Match
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Alert Row ─────────────────────────────────────────────────────────────────

function AlertRow({
  alert,
  onStatusChange,
  onRetryAsana,
  asanaRetrying,
}: {
  alert: TFSAlert;
  onStatusChange: (_id: string, _status: TFSAlertStatus, _extra?: Partial<TFSAlert>) => void;
  onRetryAsana: (_id: string) => void;
  asanaRetrying: boolean;
}) {
  const [showGoAML, setShowGoAML] = useState(false);
  const [showMatch, setShowMatch] = useState(false);

  return (
    <>
      {showGoAML && (
        <GoAMLModal
          onConfirm={(ref) => {
            setShowGoAML(false);
            onStatusChange(alert.id, "REPORTED", {
              goamlReference: ref,
              dateActioned: new Date().toISOString(),
            });
          }}
          onCancel={() => setShowGoAML(false)}
        />
      )}
      {showMatch && (
        <MatchNotesModal
          onConfirm={(notes) => {
            setShowMatch(false);
            onStatusChange(alert.id, "MATCH_FOUND", {
              notes,
              dateActioned: new Date().toISOString(),
            });
          }}
          onCancel={() => setShowMatch(false)}
        />
      )}

      <tr className="border-b border-hair hover:bg-bg-0 transition-colors">
        <td className="px-3 py-2.5 text-11 text-ink-1 font-mono whitespace-nowrap">
          {fmtDate(alert.dateReceived)}
        </td>
        <td className="px-3 py-2.5 text-12 text-ink-0 max-w-[260px]">
          <div className="truncate" title={alert.subject}>
            {alert.subject || "(no subject)"}
          </div>
          {alert.snippet && (
            <div className="text-10 text-ink-3 truncate mt-0.5">{alert.snippet.slice(0, 80)}</div>
          )}
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={alert.status} />
        </td>
        <td className="px-3 py-2.5 text-11">
          {alert.asanaTaskUrl ? (
            <a
              href={alert.asanaTaskUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue hover:underline font-mono"
            >
              #{alert.asanaTaskId?.slice(-6) ?? "task"}
            </a>
          ) : alert.asanaTaskId === "FAILED" ? (
            <span className="text-red text-10">
              Failed{" "}
              <button
                type="button"
                onClick={() => onRetryAsana(alert.id)}
                disabled={asanaRetrying}
                className="underline hover:no-underline disabled:opacity-50"
              >
                {asanaRetrying ? "Retrying…" : "Retry"}
              </button>
            </span>
          ) : (
            <span className="text-ink-3 text-10">—</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {alert.status === "NEW" && (
              <button
                type="button"
                onClick={() => onStatusChange(alert.id, "SCREENING_IN_PROGRESS")}
                className="px-2 py-0.5 text-10 rounded border border-orange/40 text-orange hover:bg-orange-dim transition-colors whitespace-nowrap"
              >
                Start Screening
              </button>
            )}
            {(alert.status === "SCREENING_IN_PROGRESS" || alert.status === "SCREENED") && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    onStatusChange(alert.id, "NO_MATCH", {
                      dateActioned: new Date().toISOString(),
                    })
                  }
                  className="px-2 py-0.5 text-10 rounded border border-green/40 text-green hover:bg-green-dim transition-colors whitespace-nowrap"
                >
                  No Match
                </button>
                <button
                  type="button"
                  onClick={() => setShowMatch(true)}
                  className="px-2 py-0.5 text-10 rounded border border-red/40 text-red hover:bg-red-dim transition-colors whitespace-nowrap"
                >
                  Match Found
                </button>
              </>
            )}
            {alert.status === "MATCH_FOUND" && (
              <button
                type="button"
                onClick={() => setShowGoAML(true)}
                className="px-2 py-0.5 text-10 rounded border border-brand/40 text-brand hover:bg-brand-dim transition-colors whitespace-nowrap"
              >
                Mark Reported
              </button>
            )}
            {alert.status === "REPORTED" && alert.goamlReference && (
              <span className="text-10 text-ink-3 font-mono">
                goAML: {alert.goamlReference}
              </span>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TFSAlertsPage() {
  const [alerts, setAlerts] = useState<TFSAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Searching Gmail…");
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [gmailReAuthNeeded, setGmailReAuthNeeded] = useState(false);
  const [gmailReAuthSuccess, setGmailReAuthSuccess] = useState(false);
  const [asanaRetrying, setAsanaRetrying] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Hydrate from localStorage and sync with server on mount
  useEffect(() => {
    const refresh = () => {
      if (mountedRef.current) setAlerts(loadAlerts());
    };
    refresh();
    void syncFromServer().then(() => {
      if (mountedRef.current) setAlerts(loadAlerts());
    });

    // Restore lastChecked
    try {
      const ts = localStorage.getItem("hawkeye.tfs-alerts.lastChecked");
      if (ts && mountedRef.current) setLastChecked(ts);
    } catch {
      // ignore
    }

    window.addEventListener("hawkeye:tfs-alerts-updated", refresh);
    return () => window.removeEventListener("hawkeye:tfs-alerts-updated", refresh);
  }, []);

  // Handle ?gmail=authorized / ?gmail=error from OAuth callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmail = params.get("gmail");
    if (gmail === "authorized") {
      setGmailReAuthSuccess(true);
      setGmailReAuthNeeded(false);
      setErrorMsg(null);
      // Clean URL
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    } else if (gmail === "error") {
      const reason = params.get("reason") ?? "unknown";
      setErrorMsg(`Gmail re-authorization failed: ${reason.replace(/_/g, " ")}. Please try again or contact support.`);
      setGmailReAuthNeeded(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const totalAlerts = alerts.length;
  const pendingAction = alerts.filter(
    (a) => a.status === "NEW" || a.status === "SCREENING_IN_PROGRESS",
  ).length;

  // ── Gmail search & Asana task creation ──────────────────────────────────

  const checkForAlerts = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setResultMsg(null);
    setErrorMsg(null);
    setLoadingMsg("Searching Gmail…");

    try {
      const current = loadAlerts();
      const knownIds = current.map((a) => a.id);

      const searchRes = await fetch("/api/tfs-alerts/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knownThreadIds: knownIds }),
      });

      if (!mountedRef.current) return;

      if (!searchRes.ok) {
        if (searchRes.status === 401) {
          setErrorMsg("Authentication required — please refresh the page.");
          return;
        }
        let err: { error?: string } = {};
        try { err = (await searchRes.json()) as { error?: string }; } catch { /* non-JSON error body */ }
        if (err.error === "GMAIL_REFRESH_FAILED") {
          setGmailReAuthNeeded(true);
          setErrorMsg(
            "Google rejected the Gmail refresh token — it may have been revoked or expired. Click \"Re-authorize Gmail\" below to reconnect in one click.",
          );
        } else if (err.error === "GMAIL_AUTH_FAILED") {
          setGmailReAuthNeeded(true);
          setErrorMsg(
            "Gmail access token has expired. Click \"Re-authorize Gmail\" below to reconnect.",
          );
        } else if (err.error === "GMAIL_NOT_CONFIGURED") {
          setGmailReAuthNeeded(true);
          setErrorMsg(
            "Email integration is not configured — contact your system administrator to complete the Gmail OAuth setup.",
          );
        } else if (err.error === "NETWORK_TIMEOUT") {
          setErrorMsg("Search timed out. Please try again.");
        } else {
          setErrorMsg("Gmail search failed. Please try again.");
        }
        return;
      }

      const searchData = (await searchRes.json()) as {
        ok: boolean;
        candidates?: Array<{
          threadId: string;
          messageId: string;
          dateReceived: string;
          subject: string;
          sender: string;
          snippet: string;
        }>;
      };

      if (!mountedRef.current) return;

      const candidates = searchData.candidates ?? [];

      if (candidates.length === 0) {
        const now = new Date().toISOString();
        setLastChecked(now);
        try {
          localStorage.setItem("hawkeye.tfs-alerts.lastChecked", now);
        } catch {
          // ignore
        }
        setResultMsg("No new alerts. Inbox is clear.");
        return;
      }

      // Process each new candidate
      setLoadingMsg(`Processing ${candidates.length} new alert${candidates.length > 1 ? "s" : ""}…`);

      let newCount = 0;
      for (const c of candidates) {
        if (!mountedRef.current) return;

        const alertType = parseAlertType(c.subject);

        // Create Asana task
        let asanaTaskId: string | null = null;
        let asanaTaskUrl: string | null = null;

        try {
          const taskRes = await fetch("/api/tfs-alerts/create-task", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              threadId: c.threadId,
              subject: c.subject,
              sender: c.sender,
              dateReceived: c.dateReceived,
              snippet: c.snippet,
              alertType,
            }),
          });

          if (taskRes.ok) {
            const taskData = (await taskRes.json()) as {
              ok: boolean;
              taskId?: string;
              taskUrl?: string;
            };
            if (taskData.ok) {
              asanaTaskId = taskData.taskId ?? null;
              asanaTaskUrl = taskData.taskUrl ?? null;
            } else {
              asanaTaskId = "FAILED";
            }
          } else {
            asanaTaskId = "FAILED";
          }
        } catch {
          asanaTaskId = "FAILED";
        }

        const newAlert: TFSAlert = {
          id: c.threadId,
          dateReceived: c.dateReceived,
          subject: c.subject,
          sender: c.sender,
          snippet: c.snippet,
          alertType,
          status: "NEW",
          asanaTaskId,
          asanaTaskUrl,
          dateActioned: null,
          goamlReference: null,
          notes: "",
        };

        upsertAlert(newAlert);
        newCount++;
      }

      if (!mountedRef.current) return;

      const now = new Date().toISOString();
      setLastChecked(now);
      try {
        localStorage.setItem("hawkeye.tfs-alerts.lastChecked", now);
      } catch {
        // ignore
      }

      setAlerts(loadAlerts());
      setResultMsg(
        `${newCount} new alert${newCount !== 1 ? "s" : ""} found and logged.`,
      );
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = caughtErrorMessage(err);
      if (msg.includes("fetch") || msg.includes("network")) {
        setErrorMsg("Search timed out. Please try again.");
      } else {
        setErrorMsg("An unexpected error occurred. Please try again.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [loading]);

  // ── Status change handler ──────────────────────────────────────────────

  const handleStatusChange = useCallback(
    (id: string, status: TFSAlertStatus, extra?: Partial<TFSAlert>) => {
      setAlerts((prev) => {
        const idx = prev.findIndex((a) => a.id === id);
        if (idx < 0) return prev;
        const updated = prev.map((a, i) => i === idx ? { ...a, status, ...extra } : a);
        saveAlerts(updated);
        return updated;
      });
    },
    [],
  );

  // ── Retry Asana task ──────────────────────────────────────────────────

  const handleRetryAsana = useCallback(async (id: string) => {
    setAsanaRetrying(id);
    const current = loadAlerts();
    const alert = current.find((a) => a.id === id);
    if (!alert) {
      setAsanaRetrying(null);
      return;
    }

    try {
      const taskRes = await fetch("/api/tfs-alerts/create-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: alert.id,
          subject: alert.subject,
          sender: alert.sender,
          dateReceived: alert.dateReceived,
          snippet: alert.snippet,
          alertType: alert.alertType,
        }),
      });

      if (taskRes.ok) {
        const taskData = (await taskRes.json()) as {
          ok: boolean;
          taskId?: string;
          taskUrl?: string;
        };
        if (taskData.ok) {
          const idx = current.findIndex((a) => a.id === id);
          if (idx >= 0) {
            current[idx] = {
              ...current[idx]!,
              asanaTaskId: taskData.taskId ?? null,
              asanaTaskUrl: taskData.taskUrl ?? null,
            };
            saveAlerts(current);
            setAlerts([...current]);
          }
        }
      }
    } catch {
      // silent — retry failed, user can try again
    } finally {
      setAsanaRetrying(null);
    }
  }, []);

  // ── Export CSV ────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    const rows = [
      [
        "Date Received",
        "Subject",
        "Sender",
        "Alert Type",
        "Status",
        "Date Actioned",
        "goAML Reference",
        "Asana Task URL",
        "Notes",
      ].join(","),
      ...alerts.map((a) =>
        [
          csvEscape(fmtDate(a.dateReceived)),
          csvEscape(a.subject),
          csvEscape(a.sender),
          csvEscape(a.alertType),
          csvEscape(STATUS_LABEL[a.status]),
          csvEscape(a.dateActioned ? fmtDate(a.dateActioned) : ""),
          csvEscape(a.goamlReference),
          csvEscape(a.asanaTaskUrl),
          csvEscape(a.notes),
        ].join(","),
      ),
    ].join("\n");

    const date = new Date().toISOString().split("T")[0]!;
    const blob = new Blob([rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TFS_Alert_Log_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [alerts]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <ModuleLayout
      engineLabel="TFS alert monitor"
      asanaModule="tfs-alerts"
      asanaLabel="TFS Alerts"
      onRun={() => void checkForAlerts()}
      sidebarActions={
        <ActionButton
          variant="screening"
          type="button"
          onClick={() => void checkForAlerts()}
          disabled={loading}
        >
          {loading ? loadingMsg : "🔍 Check for New TFS Alerts"}
        </ActionButton>
      }
    >
      <ModuleHero
        eyebrow=""
        title="TFS Subscription"
        titleEm="Alerts."
        kpis={[
          {
            value: String(totalAlerts),
            label: "Total alerts",
          },
          {
            value: String(pendingAction),
            label: "Pending action",
            tone: pendingAction > 0 ? "red" : undefined,
          },
        ]}
        intro={
          <>
            EOCN Notification Alert System — UAE Local Terrorist List &amp; UN Consolidated List.
            Monitors Gmail for TFS alert emails from the UAE Executive Office for Control &amp;
            Non-Proliferation (EOCN) and creates Asana compliance tasks automatically.
          </>
        }
      />

      {/* ── Subscription status row ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 rounded-lg border border-hair-2 bg-bg-0">
        <div className="flex items-center gap-2">
          <span className="text-11 uppercase tracking-wide-3 text-ink-3 font-medium">
            Subscription Status:
          </span>
          {gmailReAuthNeeded ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-dim text-red text-11 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-red shrink-0" />
              DISCONNECTED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-dim text-green text-11 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green shrink-0" />
              ACTIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-11 uppercase tracking-wide-3 text-ink-3 font-medium">Source:</span>
          <span className="font-mono text-11 text-ink-1">sanctions@eocn.gov.ae</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-11 uppercase tracking-wide-3 text-ink-3 font-medium">
            Last Checked:
          </span>
          <span className="font-mono text-11 text-ink-1">
            {lastChecked ? fmtDate(lastChecked) : "Never"}
          </span>
        </div>
      </div>

      {/* ── Check button + result ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 mb-6 empty:mb-0">
        {resultMsg && !loading && (
          <span
            className={`text-12 font-medium ${resultMsg.includes("No new") ? "text-green" : "text-brand"}`}
          >
            {resultMsg}
          </span>
        )}

        {errorMsg && !loading && (
          <span className="text-12 text-red">{errorMsg}</span>
        )}
      </div>

      {/* ── Gmail re-authorization banner ────────────────────────────────────── */}
      {gmailReAuthSuccess && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-green/40 bg-green-dim px-4 py-3">
          <span className="text-green text-13">✓</span>
          <div>
            <div className="text-12 font-semibold text-green">Gmail re-authorized successfully</div>
            <div className="text-11 text-ink-2">Click &quot;Check for New TFS Alerts&quot; to search your inbox.</div>
          </div>
          <button type="button" onClick={() => setGmailReAuthSuccess(false)} className="ml-auto text-10 text-ink-3 hover:text-ink-1">✕</button>
        </div>
      )}

      {gmailReAuthNeeded && !loading && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-red/40 bg-red-dim px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="text-12 font-semibold text-red">Gmail connection lost</div>
            <div className="text-11 text-ink-2">
              Click the button to reconnect in one step. You will be redirected to Google&apos;s consent screen and back.
            </div>
          </div>
          <a
            href="/api/auth/gmail/authorize"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red text-white text-12 font-semibold hover:bg-red/80 transition-colors whitespace-nowrap"
          >
            <span>🔗</span>
            <span>Re-authorize Gmail</span>
          </a>
        </div>
      )}

      {/* ── Alerts table ─────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-13 font-semibold text-ink-0 uppercase tracking-wide-3">
            Alert Log
          </h2>
          {alerts.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-hair-2 text-12 text-ink-1 hover:bg-bg-1 transition-colors"
            >
              📥 Export Audit Trail
            </button>
          )}
        </div>

        {alerts.length === 0 ? (
          <div className="rounded-lg border border-hair-2 bg-bg-0 px-6 py-10 text-center">
            <div className="text-28 mb-2">📭</div>
            <div className="text-13 text-ink-1 font-medium">No TFS alerts on record</div>
            <div className="text-12 text-ink-3 mt-1">
              Click &quot;Check for New TFS Alerts&quot; to search your Gmail inbox.
            </div>
            {!process.env["NEXT_PUBLIC_GMAIL_CONFIGURED"] && (
              <div className="mt-3 text-11 text-orange bg-orange-dim px-3 py-2 rounded inline-block">
                Email integration is not configured — contact your system administrator to complete the Gmail OAuth setup.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-hair-2 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-hair-2 bg-bg-0">
                  <th className="px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-3 font-medium whitespace-nowrap">
                    Date Received
                  </th>
                  <th className="px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-3 font-medium">
                    Subject
                  </th>
                  <th className="px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-3 font-medium whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-3 font-medium whitespace-nowrap">
                    Asana Task
                  </th>
                  <th className="px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-3 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    onStatusChange={handleStatusChange}
                    onRetryAsana={(id) => void handleRetryAsana(id)}
                    asanaRetrying={asanaRetrying === alert.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Regulatory notice ────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-hair-2 bg-bg-0 p-5 mb-4">
        <div className="flex items-start gap-3">
          <span className="text-16 shrink-0 mt-0.5">⚖️</span>
          <div>
            <div className="text-12 font-semibold text-ink-0 uppercase tracking-wide-3 mb-2">
              Regulatory Notice
            </div>
            <div className="text-12 text-ink-1 leading-[1.7] space-y-1">
              <p>This module operates under:</p>
              <ul className="list-none ml-3 space-y-0.5">
                <li>- Federal Decree-Law No. (10) of 2025 — AML/CFT/CPF</li>
                <li>- Cabinet Resolution No. (134) of 2025 — Executive Regulations</li>
                <li>- Cabinet Resolution No. (74) of 2020 — TFS Framework</li>
              </ul>
              <p className="mt-2">
                Upon receipt of a TFS alert, screening of the full customer database must be
                completed within 24 hours. Confirmed matches must be reported via goAML within 5
                business days. Failure to comply may result in fines of AED 50,000 to AED
                5,000,000 and/or imprisonment.
              </p>
            </div>
          </div>
        </div>
      </div>
    </ModuleLayout>
  );
}
