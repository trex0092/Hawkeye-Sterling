"use client";

import { useState } from "react";

export interface StrDraftPayload {
  question: string;
  narrative: string;
  defaultJurisdiction?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  payload: StrDraftPayload;
}

const REPORT_CODES = ["STR", "SAR", "FFR", "PNMR", "CTR", "AIF", "EFT", "HRC", "RFI"] as const;
type ReportCode = (typeof REPORT_CODES)[number];

type EntityType = "individual" | "organisation" | "vessel" | "aircraft" | "other";

export function StrDraftModal({ open, onClose, payload }: Props) {
  const [reportCode, setReportCode] = useState<ReportCode>("STR");
  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState<EntityType>("individual");
  const [jurisdiction, setJurisdiction] = useState(payload.defaultJurisdiction ?? "AE");
  const [idNumber, setIdNumber] = useState("");
  const [caseId, setCaseId] = useState("");
  const [amountAed, setAmountAed] = useState<string>("");
  const [counterparty, setCounterparty] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    if (!name.trim()) {
      setError("Subject name is required.");
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const body = {
        reportCode,
        subject: {
          name: name.trim(),
          entityType,
          jurisdiction: jurisdiction.trim() || undefined,
          idNumber: idNumber.trim() || undefined,
          caseId: caseId.trim() || undefined,
        },
        narrative: `${payload.question}\n\n---\n\n${payload.narrative}`,
        amountAed: amountAed ? Number(amountAed) : undefined,
        counterparty: counterparty.trim() || undefined,
      };
      const res = await fetch("/api/goaml", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `HTTP ${res.status}`;
        try { msg = JSON.parse(text).error ?? msg; } catch { /* xml or html */ }
        throw new Error(msg);
      }
      const xml = await res.text();
      const blob = new Blob([xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = name.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40);
      a.href = url;
      a.download = `goaml-${reportCode.toLowerCase()}-${safeName}-${Date.now()}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft failed");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-bg-panel border border-hair-2 rounded-xl max-w-lg w-full p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-brand">
              goAML draft
            </div>
            <div className="text-13 text-ink-0 font-medium mt-0.5">
              Build a {reportCode} XML from this advisor verdict
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink-0 text-18 leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">Report code</span>
              <select
                value={reportCode}
                onChange={(e) => setReportCode(e.target.value as ReportCode)}
                className="w-full mt-1 px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1"
              >
                {REPORT_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">Subject type</span>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as EntityType)}
                className="w-full mt-1 px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1"
              >
                <option value="individual">Individual</option>
                <option value="organisation">Organisation</option>
                <option value="vessel">Vessel</option>
                <option value="aircraft">Aircraft</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">Subject name *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={entityType === "individual" ? "Full legal name" : "Legal entity name"}
              className="w-full mt-1 px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">Jurisdiction (ISO-2)</span>
              <input
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value.toUpperCase())}
                maxLength={2}
                placeholder="AE"
                className="w-full mt-1 px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">ID / Reg number</span>
              <input
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="Emirates ID / Trade licence"
                className="w-full mt-1 px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">Case ID</span>
              <input
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                placeholder="Optional"
                className="w-full mt-1 px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1"
              />
            </label>
            <label className="block">
              <span className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">Amount (AED)</span>
              <input
                value={amountAed}
                onChange={(e) => setAmountAed(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="Optional"
                inputMode="decimal"
                className="w-full mt-1 px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1 font-mono"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-10 uppercase tracking-wide-3 text-ink-3 font-semibold">Counterparty</span>
            <input
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="Optional"
              className="w-full mt-1 px-2 py-1.5 border border-hair-2 rounded text-12 bg-bg-1"
            />
          </label>

          {error && (
            <div className="bg-red-dim border border-red/30 rounded p-2 text-11 text-red">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-hair-2">
            <button
              type="button"
              onClick={onClose}
              className="text-11 text-ink-3 hover:text-ink-0 px-3 py-1.5 rounded"
              disabled={posting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { void submit(); }}
              disabled={posting || !name.trim()}
              className="px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {posting ? "Drafting…" : `Draft ${reportCode} XML`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
