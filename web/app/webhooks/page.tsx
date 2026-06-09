"use client";

import { useState, useEffect, useCallback } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";
import { caughtErrorMessage } from "@/lib/client/error-utils";
import type { WebhookRegistration, WebhookDelivery, WebhookEvent } from "@/lib/server/webhook-emitter";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_EVENTS: WebhookEvent[] = [
  "case.opened",
  "case.closed",
  "case.escalated",
  "sar.filed",
  "subject.frozen",
  "subject.cleared",
  "screening.completed",
  "edd.triggered",
  "four_eyes.approved",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ success, code }: { success: boolean; code?: number }) {
  const base = "inline-flex items-center px-2 py-0.5 rounded text-10 font-semibold uppercase tracking-wide-2";
  if (success) {
    return (
      <span className={`${base} bg-green-dim text-green`}>
        {code ?? "OK"}
      </span>
    );
  }
  return (
    <span className={`${base} bg-red-dim text-red`}>
      {code ? String(code) : "ERR"}
    </span>
  );
}

// ── Active Toggle ─────────────────────────────────────────────────────────────

function ActiveToggle({
  active,
  onChange,
  disabled,
}: {
  active: boolean;
  onChange: (_v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!active)}
      className={`relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
        active ? "bg-brand" : "bg-bg-2"
      }`}
      aria-pressed={active}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          active ? "translate-x-4" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ── Register Form ─────────────────────────────────────────────────────────────

function RegisterForm({ onCreated }: { onCreated: () => void }) {
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<WebhookEvent>>(
    new Set(ALL_EVENTS),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function toggleEvent(ev: WebhookEvent) {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(ev)) {
        next.delete(ev);
      } else {
        next.add(ev);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          events: Array.from(selectedEvents),
          secret,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to register webhook");
        return;
      }
      setUrl("");
      setSecret("");
      setSelectedEvents(new Set(ALL_EVENTS));
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(caughtErrorMessage(err, "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-1.5 rounded text-12 text-white bg-brand hover:opacity-90 transition-opacity font-medium"
      >
        + Register Webhook
      </button>
    );
  }

  return (
    <div className="border border-hair-2 rounded-lg bg-bg-panel p-5 mb-6">
      <h3 className="text-14 font-semibold text-ink-0 mb-4">Register Webhook</h3>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <div>
          <label className="block text-11 uppercase tracking-wide-4 text-ink-2 mb-1 font-medium">
            Endpoint URL (https)
          </label>
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/webhook"
            className="w-full border border-hair-2 rounded px-3 py-2 text-13 bg-bg-0 text-ink-0 focus:outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="block text-11 uppercase tracking-wide-4 text-ink-2 mb-1 font-medium">
            Signing Secret (min 16 chars)
          </label>
          <input
            type="password"
            required
            minLength={16}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Your HMAC-SHA256 signing secret"
            className="w-full border border-hair-2 rounded px-3 py-2 text-13 bg-bg-0 text-ink-0 focus:outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="block text-11 uppercase tracking-wide-4 text-ink-2 mb-2 font-medium">
            Events to Subscribe
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-2 text-12 text-ink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedEvents.has(ev)}
                  onChange={() => toggleEvent(ev)}
                  className="rounded border-hair-2 text-brand focus:ring-brand"
                />
                <span className="font-mono">{ev}</span>
              </label>
            ))}
          </div>
        </div>
        {error && (
          <p className="text-12 text-red">{error}</p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => { setOpen(false); setError(null); }}
            className="px-4 py-1.5 rounded text-12 text-ink-2 border border-hair-2 hover:bg-bg-1 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || selectedEvents.size === 0}
            className="px-4 py-1.5 rounded text-12 text-white bg-brand hover:opacity-90 transition-opacity disabled:opacity-40 font-medium"
          >
            {saving ? "Registering…" : "Register"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Webhooks Table ────────────────────────────────────────────────────────────

function WebhooksTable({
  webhooks,
  onToggle,
  onTest,
  onDelete,
  loadingId,
}: {
  webhooks: WebhookRegistration[];
  onToggle: (_id: string, _active: boolean) => void;
  onTest: (_id: string) => void;
  onDelete: (_id: string) => void;
  loadingId: string | null;
}) {
  if (webhooks.length === 0) {
    return (
      <p className="text-12 text-ink-2 py-8 text-center">
        No webhooks registered yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-12 border-collapse">
        <thead>
          <tr className="border-b border-hair-2">
            <th className="text-left py-2 px-3 text-11 uppercase tracking-wide-4 text-ink-2 font-medium">URL</th>
            <th className="text-left py-2 px-3 text-11 uppercase tracking-wide-4 text-ink-2 font-medium">Events</th>
            <th className="text-left py-2 px-3 text-11 uppercase tracking-wide-4 text-ink-2 font-medium">Active</th>
            <th className="text-left py-2 px-3 text-11 uppercase tracking-wide-4 text-ink-2 font-medium">Last Delivery</th>
            <th className="text-left py-2 px-3 text-11 uppercase tracking-wide-4 text-ink-2 font-medium">Failures</th>
            <th className="py-2 px-3" />
          </tr>
        </thead>
        <tbody>
          {webhooks.map((wh) => (
            <tr key={wh.id} className="border-b border-hair-2 hover:bg-bg-1 transition-colors">
              <td className="py-2 px-3 font-mono text-ink-0 max-w-xs truncate" title={wh.url}>
                {wh.url}
              </td>
              <td className="py-2 px-3">
                <div className="flex flex-wrap gap-1">
                  {wh.events.map((ev) => (
                    <span
                      key={ev}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-10 font-mono bg-bg-2 text-ink-1"
                    >
                      {ev}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-2 px-3">
                <ActiveToggle
                  active={wh.active}
                  disabled={loadingId === wh.id}
                  onChange={(v) => onToggle(wh.id, v)}
                />
              </td>
              <td className="py-2 px-3 text-ink-2">
                {wh.lastDeliveryAt ? (
                  <span className="flex items-center gap-1">
                    {wh.lastDeliveryStatus !== undefined && (
                      <StatusBadge
                        success={wh.lastDeliveryStatus >= 200 && wh.lastDeliveryStatus < 300}
                        code={wh.lastDeliveryStatus}
                      />
                    )}
                    <span className="text-11">{fmtDate(wh.lastDeliveryAt)}</span>
                  </span>
                ) : (
                  <span className="text-ink-3">Never</span>
                )}
              </td>
              <td className="py-2 px-3">
                {wh.failureCount > 0 ? (
                  <span className="text-red font-semibold">{wh.failureCount}</span>
                ) : (
                  <span className="text-ink-3">0</span>
                )}
              </td>
              <td className="py-2 px-3">
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    disabled={loadingId === wh.id}
                    onClick={() => onTest(wh.id)}
                    className="px-3 py-1 rounded text-11 text-ink-1 border border-hair-2 hover:bg-bg-1 transition-colors disabled:opacity-40"
                  >
                    Test
                  </button>
                  <button
                    type="button"
                    disabled={loadingId === wh.id}
                    onClick={() => onDelete(wh.id)}
                    className="px-3 py-1 rounded text-11 text-red border border-red/30 hover:bg-red-dim transition-colors disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Deliveries Table ──────────────────────────────────────────────────────────

function DeliveriesTable({ deliveries }: { deliveries: WebhookDelivery[] }) {
  if (deliveries.length === 0) {
    return (
      <p className="text-12 text-ink-2 py-8 text-center">
        No delivery records yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-12 border-collapse">
        <thead>
          <tr className="border-b border-hair-2">
            <th className="text-left py-2 px-3 text-11 uppercase tracking-wide-4 text-ink-2 font-medium">Event</th>
            <th className="text-left py-2 px-3 text-11 uppercase tracking-wide-4 text-ink-2 font-medium">Sent At</th>
            <th className="text-left py-2 px-3 text-11 uppercase tracking-wide-4 text-ink-2 font-medium">Status</th>
            <th className="text-left py-2 px-3 text-11 uppercase tracking-wide-4 text-ink-2 font-medium">Result</th>
            <th className="text-left py-2 px-3 text-11 uppercase tracking-wide-4 text-ink-2 font-medium">Response</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.id} className="border-b border-hair-2 hover:bg-bg-1 transition-colors">
              <td className="py-2 px-3 font-mono text-ink-0">{d.event}</td>
              <td className="py-2 px-3 text-ink-2 text-11">{fmtDate(d.sentAt)}</td>
              <td className="py-2 px-3">
                {d.statusCode !== undefined ? (
                  <StatusBadge success={d.success} code={d.statusCode} />
                ) : (
                  <StatusBadge success={false} />
                )}
              </td>
              <td className="py-2 px-3">
                {d.success ? (
                  <span className="text-green font-medium">Success</span>
                ) : (
                  <span className="text-red font-medium">Failed</span>
                )}
              </td>
              <td className="py-2 px-3 text-ink-2">
                {d.responseMs !== undefined ? `${d.responseMs}ms` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookRegistration[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  const loadWebhooks = useCallback(async () => {
    try {
      const res = await fetch("/api/webhooks");
      const data = (await res.json()) as { webhooks?: WebhookRegistration[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to load webhooks");
        return;
      }
      setWebhooks(data.webhooks ?? []);
    } catch (err) {
      setError(caughtErrorMessage(err, "Unknown error"));
    }
  }, []);

  const loadDeliveries = useCallback(async () => {
    try {
      const res = await fetch("/api/webhooks/deliveries");
      const data = (await res.json()) as { deliveries?: WebhookDelivery[]; error?: string };
      if (res.ok) {
        setDeliveries(data.deliveries ?? []);
      }
    } catch {
      // delivery log is optional — don't block the page
    }
  }, []);

  useEffect(() => {
    void loadWebhooks();
    void loadDeliveries();
  }, [loadWebhooks, loadDeliveries]);

  async function handleToggle(id: string, active: boolean) {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (res.ok) {
        await loadWebhooks();
        showToast(`Webhook ${active ? "activated" : "deactivated"}`);
      }
    } finally {
      setLoadingId(null);
    }
  }

  async function handleTest(id: string) {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/webhooks/${id}/test`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        success?: boolean;
        statusCode?: number;
        responseMs?: number;
        error?: string;
      };
      if (data.success) {
        showToast(`Test delivered — HTTP ${data.statusCode ?? "?"} in ${data.responseMs ?? "?"}ms`);
      } else {
        showToast(`Test failed — HTTP ${data.statusCode ?? "ERR"}`);
      }
      await loadDeliveries();
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this webhook registration?")) return;
    setLoadingId(id);
    try {
      const res = await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadWebhooks();
        showToast("Webhook deleted");
      }
    } finally {
      setLoadingId(null);
    }
  }

  async function handleCreated() {
    await loadWebhooks();
    await loadDeliveries();
    showToast("Webhook registered");
  }

  return (
    <ModuleLayout asanaModule="webhooks" asanaLabel="Webhooks" onSync={() => void loadWebhooks()}>
      <div className="flex-1 p-6 max-w-6xl mx-auto">
        <ModuleHero
          eyebrow=""
          title="Outbound Webhooks"
          intro="Receive real-time compliance events in Salesforce, ServiceNow, Jira, or any HTTPS endpoint."
        />

        {/* Error banner */}
        {error && (
          <div className="mb-4 rounded p-3 bg-red-dim border border-red/30 text-12 text-red">
            {error}
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 bg-bg-panel border border-hair-2 shadow-lg text-12 text-ink-0">
            {toast}
          </div>
        )}

        {/* Registration form */}
        <RegisterForm onCreated={() => void handleCreated()} />

        {/* Webhooks table */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-14 font-semibold text-ink-0">
              Registered Webhooks
              <span className="ml-2 text-12 font-normal text-ink-2">({webhooks.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => { void loadWebhooks(); void loadDeliveries(); }}
              className="text-11 text-ink-2 hover:text-ink-0 transition-colors"
            >
              Refresh
            </button>
          </div>
          <div className="rounded-lg border border-hair-2 bg-bg-panel overflow-hidden">
            <WebhooksTable
              webhooks={webhooks}
              onToggle={(id, active) => void handleToggle(id, active)}
              onTest={(id) => void handleTest(id)}
              onDelete={(id) => void handleDelete(id)}
              loadingId={loadingId}
            />
          </div>
        </section>

        {/* Deliveries table */}
        <section>
          <h2 className="text-14 font-semibold text-ink-0 mb-3">
            Recent Deliveries
            <span className="ml-2 text-12 font-normal text-ink-2">
              (last {deliveries.length})
            </span>
          </h2>
          <div className="rounded-lg border border-hair-2 bg-bg-panel overflow-hidden">
            <DeliveriesTable deliveries={deliveries} />
          </div>
        </section>
      </div>
    </ModuleLayout>
  );
}
