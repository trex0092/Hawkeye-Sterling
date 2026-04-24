"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

type Capacity =
  | "subject"
  | "legal_representative"
  | "data_controller"
  | "other";

export default function CorrectionsPage() {
  const [form, setForm] = useState({
    subjectName: "",
    listId: "",
    listRef: "",
    requesterName: "",
    requesterEmail: "",
    requesterCapacity: "subject" as Capacity,
    claim: "",
    evidenceUrls: "",
  });
  const [receipt, setReceipt] = useState<{
    id: string;
    dueBy: string;
    message: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update =
    <K extends keyof typeof form>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [k]: e.target.value }));
    };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          evidenceUrls: form.evidenceUrls
            ? form.evidenceUrls.split(/\s+/).filter(Boolean)
            : undefined,
        }),
      });
      const payload = (await res.json()) as
        | { ok: true; id: string; dueBy: string; message: string }
        | { ok: false; error?: string };
      if (!payload.ok) {
        setErr(payload.error ?? "submission failed");
      } else {
        setReceipt(payload);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModuleLayout>
      <div>
        <ModuleHero
          eyebrow="Public-facing form"
          title="Record correction"
          titleEm="request."
          intro={
            <>
              Dispute or request correction of a watchlist or adverse-media
              record that mentions you. Reviewed within 30 days of receipt.
              Appeals can be escalated via{" "}
              <code>/api/corrections/&lt;id&gt;</code> using the receipt ID
              you&apos;ll receive on submission.
            </>
          }
        />

        <div className="bg-bg-1 border border-hair-2 rounded-lg p-4 mb-6 text-12 text-ink-1">
          <strong>Review SLA:</strong> 30 calendar days · <strong>Appeals:</strong>{" "}
          unlimited, routed to MLRO · <strong>Lawful basis:</strong> GDPR Art.
          16 (Rectification) / Art. 17 (Erasure).
        </div>

        {receipt ? (
          <div className="bg-green-dim text-green rounded-lg p-6 mb-6">
            <div className="font-semibold mb-2">Request received</div>
            <div className="text-12 text-ink-0 mb-1">
              Receipt ID:{" "}
              <span className="font-mono">{receipt.id}</span>
            </div>
            <div className="text-12 text-ink-0 mb-1">
              Response due by:{" "}
              <span className="font-mono">
                {new Date(receipt.dueBy).toLocaleDateString()}
              </span>
            </div>
            <div className="text-11 text-ink-2 mt-2">{receipt.message}</div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Row label="Subject name on the record *">
              <input
                required
                className="w-full rounded border border-hair-2 bg-bg-panel px-3 py-2 text-13 text-ink-0"
                value={form.subjectName}
                onChange={update("subjectName")}
              />
            </Row>
            <div className="grid grid-cols-2 gap-3">
              <Row label="List ID">
                <input
                  className="w-full rounded border border-hair-2 bg-bg-panel px-3 py-2 text-13 text-ink-0 font-mono"
                  placeholder="OFAC-SDN"
                  value={form.listId}
                  onChange={update("listId")}
                />
              </Row>
              <Row label="List reference">
                <input
                  className="w-full rounded border border-hair-2 bg-bg-panel px-3 py-2 text-13 text-ink-0 font-mono"
                  placeholder="OFAC-12345"
                  value={form.listRef}
                  onChange={update("listRef")}
                />
              </Row>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Your name *">
                <input
                  required
                  className="w-full rounded border border-hair-2 bg-bg-panel px-3 py-2 text-13 text-ink-0"
                  value={form.requesterName}
                  onChange={update("requesterName")}
                />
              </Row>
              <Row label="Your email *">
                <input
                  required
                  type="email"
                  className="w-full rounded border border-hair-2 bg-bg-panel px-3 py-2 text-13 text-ink-0"
                  value={form.requesterEmail}
                  onChange={update("requesterEmail")}
                />
              </Row>
            </div>
            <Row label="Filing as *">
              <select
                required
                className="w-full rounded border border-hair-2 bg-bg-panel px-3 py-2 text-13 text-ink-0"
                value={form.requesterCapacity}
                onChange={update("requesterCapacity")}
              >
                <option value="subject">The subject of the record</option>
                <option value="legal_representative">Legal representative</option>
                <option value="data_controller">Data controller</option>
                <option value="other">Other</option>
              </select>
            </Row>
            <Row label="Claim / rationale *">
              <textarea
                required
                rows={5}
                className="w-full rounded border border-hair-2 bg-bg-panel px-3 py-2 text-13 text-ink-0"
                placeholder="Describe why the record is inaccurate, outdated or unlawful."
                value={form.claim}
                onChange={update("claim")}
              />
            </Row>
            <Row label="Evidence URLs (one per line)">
              <textarea
                rows={3}
                className="w-full rounded border border-hair-2 bg-bg-panel px-3 py-2 text-13 text-ink-0 font-mono"
                value={form.evidenceUrls}
                onChange={update("evidenceUrls")}
              />
            </Row>
            {err && (
              <div className="bg-red-dim text-red text-12 rounded px-3 py-2">
                {err}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="bg-brand text-white font-semibold rounded px-5 py-2 text-13 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit correction request"}
            </button>
          </form>
        )}
      </div>
    </ModuleLayout>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-11 font-medium uppercase tracking-wide-3 text-ink-2 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
