"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import type { DpmsrObligation, DpmsrTransaction } from "@/app/api/dpmsr-trigger/route";

// DPMSR — Designated Precious Metals and Stones Report
// CR134/2025 Art.3: any single cash transaction OR linked cash transactions
// totalling AED 55,000 or above triggers a mandatory DPMSR filing via goAML.
// This is NOT the same as a STR — it is triggered by amount alone.

const THRESHOLD_AED = 55_000;

const STATUS_TONE: Record<DpmsrObligation["status"], string> = {
  pending: "bg-amber-dim text-amber border border-amber/30",
  filed: "bg-green-dim text-green border border-green/30",
  overdue: "bg-red-dim text-red border border-red/30",
};

const STATUS_LABEL: Record<DpmsrObligation["status"], string> = {
  pending: "Pending",
  filed: "Filed",
  overdue: "OVERDUE",
};

function DeadlineBadge({ deadline, status }: { deadline: string; status: DpmsrObligation["status"] }) {
  if (status === "filed") return <span className="font-mono text-11 text-green font-semibold">Filed ✓</span>;
  const now = Date.now();
  const dl = new Date(deadline).getTime();
  const hoursLeft = Math.max(0, (dl - now) / 3_600_000);
  const color = status === "overdue" || hoursLeft < 2 ? "text-red" : hoursLeft < 6 ? "text-amber" : "text-ink-1";
  return (
    <span className={`font-mono text-11 font-semibold ${color}`}>
      {status === "overdue" ? "OVERDUE" : hoursLeft < 1 ? "<1h remaining" : `${Math.floor(hoursLeft)}h remaining`}
    </span>
  );
}

interface EvaluateFormProps { onResult: (obs: DpmsrObligation[]) => void; }
function EvaluateForm({ onResult }: EvaluateFormProps) {
  const [txnId, setTxnId] = useState("");
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState<DpmsrTransaction["channel"]>("cash");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [txnDate, setTxnDate] = useState(new Date().toISOString().slice(0, 10));
  const [transactions, setTransactions] = useState<DpmsrTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evalResult, setEvalResult] = useState<{ obligationsFound: number; obligations: DpmsrObligation[] } | null>(null);
  const [saveMode, setSaveMode] = useState(false);

  const inputCls = "text-12 px-3 py-1.5 rounded border border-hair-2 bg-bg-panel text-ink-0 focus:border-brand outline-none";

  const addTxn = () => {
    const amt = parseFloat(amount);
    if (!txnId.trim() || isNaN(amt) || amt <= 0) { setError("Transaction ID and valid amount required"); return; }
    setTransactions((prev) => [...prev, {
      txnId: txnId.trim(), amountAed: amt, channel, customerId: customerId.trim() || undefined,
      customerName: customerName.trim() || undefined, at: new Date(txnDate).toISOString(),
    }]);
    setTxnId(""); setAmount(""); setError(null);
  };

  const evaluate = async (save = false) => {
    if (transactions.length === 0) { setError("Add at least one transaction to evaluate"); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/dpmsr-trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactions, save }),
      });
      const data = (await res.json()) as { ok: boolean; obligationsFound: number; obligations: DpmsrObligation[]; error?: string };
      if (!data.ok) { setError(data.error ?? "Evaluation failed"); return; }
      setEvalResult(data);
      if (save && data.obligations.length > 0) { onResult(data.obligations); setTransactions([]); setEvalResult(null); }
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
      <div className="text-12 font-semibold text-ink-0 mb-3">Evaluate transactions against AED {THRESHOLD_AED.toLocaleString()} threshold</div>

      {/* Add transaction row */}
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <div><label className="block text-10 uppercase tracking-wide-2 text-ink-3 mb-1">Transaction ID</label>
          <input value={txnId} onChange={(e) => setTxnId(e.target.value)} className={`${inputCls} w-28`} placeholder="TXN-001" /></div>
        <div><label className="block text-10 uppercase tracking-wide-2 text-ink-3 mb-1">Amount (AED)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} w-28`} placeholder="55000" /></div>
        <div><label className="block text-10 uppercase tracking-wide-2 text-ink-3 mb-1">Channel</label>
          <select value={channel} onChange={(e) => setChannel(e.target.value as DpmsrTransaction["channel"])} className={`${inputCls} w-28`}>
            <option value="cash">Cash</option>
            <option value="cash_courier">Cash courier</option>
            <option value="wire">Wire</option>
            <option value="card">Card</option>
            <option value="crypto">Crypto</option>
            <option value="other">Other</option>
          </select></div>
        <div><label className="block text-10 uppercase tracking-wide-2 text-ink-3 mb-1">Customer ID</label>
          <input value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={`${inputCls} w-28`} placeholder="CUST-001" /></div>
        <div><label className="block text-10 uppercase tracking-wide-2 text-ink-3 mb-1">Customer Name</label>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={`${inputCls} w-36`} placeholder="Full name" /></div>
        <div><label className="block text-10 uppercase tracking-wide-2 text-ink-3 mb-1">Date</label>
          <input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} className={`${inputCls} w-36`} /></div>
        <button type="button" onClick={addTxn}
          className="px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold hover:bg-brand/90">+ Add</button>
      </div>

      {error && <p className="text-11 text-red mb-2">{error}</p>}

      {transactions.length > 0 && (
        <>
          <div className="bg-bg-1 rounded border border-hair-2 overflow-hidden mb-3">
            <table className="w-full text-11">
              <thead className="bg-bg-2 border-b border-hair">
                <tr>{["ID", "Amount (AED)", "Channel", "Customer", "Date", ""].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-9 uppercase tracking-wide-3 text-ink-3 font-mono">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr key={t.txnId} className={i < transactions.length - 1 ? "border-b border-hair" : ""}>
                    <td className="px-3 py-2 font-mono text-ink-2">{t.txnId}</td>
                    <td className={`px-3 py-2 font-mono font-semibold ${t.amountAed >= THRESHOLD_AED ? "text-red" : "text-ink-0"}`}>{t.amountAed.toLocaleString()}</td>
                    <td className="px-3 py-2 text-ink-3">{t.channel}</td>
                    <td className="px-3 py-2 text-ink-2">{t.customerName ?? t.customerId ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-3 font-mono">{new Date(t.at).toLocaleDateString("en-GB")}</td>
                    <td className="px-3 py-2"><button type="button" onClick={() => setTransactions((p) => p.filter((_, j) => j !== i))} className="text-ink-3 hover:text-red">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void evaluate(false)} disabled={loading}
              className="px-4 py-2 rounded border border-hair-2 text-12 font-semibold text-ink-1 hover:bg-bg-2 disabled:opacity-50">
              {loading ? "Evaluating…" : "Evaluate (preview)"}
            </button>
            <button type="button" onClick={() => void evaluate(true)} disabled={loading}
              className="px-4 py-2 rounded bg-red text-white text-12 font-semibold hover:bg-red/90 disabled:opacity-50">
              {loading ? "Evaluating…" : "Evaluate & create obligation"}
            </button>
          </div>
        </>
      )}

      {evalResult && (
        <div className={`mt-4 rounded-lg p-4 border ${evalResult.obligationsFound > 0 ? "bg-red-dim border-red/30" : "bg-green-dim border-green/30"}`}>
          <div className={`text-13 font-bold mb-2 ${evalResult.obligationsFound > 0 ? "text-red" : "text-green"}`}>
            {evalResult.obligationsFound > 0
              ? `${evalResult.obligationsFound} DPMSR obligation(s) triggered`
              : "No DPMSR obligations — all transactions below threshold"}
          </div>
          {evalResult.obligations.map((o, i) => (
            <div key={i} className="text-11 text-ink-1 mb-1">
              • <strong>{o.triggerType === "single" ? "Single transaction" : "Linked transactions"}</strong> —
              AED {o.totalAmountAed.toLocaleString()} — {o.transactionIds.join(", ")} — {o.legalBasis}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DpmsrPage() {
  const [obligations, setObligations] = useState<DpmsrObligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const loadObligations = useCallback(async () => {
    try {
      const res = await fetch("/api/dpmsr-trigger");
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; obligations: DpmsrObligation[] };
        if (data.ok) setObligations(data.obligations);
      } else {
        console.error(`[hawkeye] dpmsr-trigger HTTP ${res.status}`);
      }
    } catch (err) {
      console.error("[hawkeye] dpmsr loadObligations threw:", err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadObligations(); }, [loadObligations]);

  const handlePatch = async (id: string, patch: Partial<DpmsrObligation>) => {
    setSaving(id);
    try {
      const res = await fetch("/api/dpmsr-trigger", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ patch: { id, ...patch } }) });
      const data = (await res.json()) as { ok: boolean; obligation?: DpmsrObligation };
      if (data.ok && data.obligation) setObligations((prev) => prev.map((o) => o.id === id ? data.obligation! : o));
    } finally { setSaving(null); }
  };

  const handleNewObligations = (obs: DpmsrObligation[]) => {
    setObligations((prev) => [...obs, ...prev]);
  };

  const pending = obligations.filter((o) => o.status === "pending").length;
  const overdue = obligations.filter((o) => o.status === "overdue").length;
  const filed = obligations.filter((o) => o.status === "filed").length;

  return (
    <ModuleLayout asanaModule="dpmsr" asanaLabel="DPMSR Filing Queue" engineLabel="DPMSR threshold engine">
      <ModuleHero
        moduleNumber={52}
        eyebrow="Module 52 · Regulatory Reporting"
        title="DPMSR — AED 55,000 threshold"
        titleEm="obligations."
        kpis={[
          { value: String(pending), label: "pending filings", tone: pending > 0 ? "amber" : undefined },
          { value: String(overdue), label: "overdue", tone: overdue > 0 ? "red" : undefined },
          { value: String(filed), label: "filed" },
          { value: `AED ${THRESHOLD_AED.toLocaleString()}`, label: "trigger threshold" },
        ]}
        intro={
          <>
            <strong>CR134/2025 Art.3 · MoE Circ.08/AML/2021.</strong>{" "}
            Any single cash transaction OR linked cash transactions totalling{" "}
            <strong>AED {THRESHOLD_AED.toLocaleString()} or above</strong> trigger a mandatory Designated
            Precious Metals & Stones Report (DPMSR) filing via goAML. This is separate from the STR flow —
            it is triggered by amount alone, regardless of suspicion. Fine for non-compliance: AED 200,000 per violation.
          </>
        }
      />

      {/* Regulatory notice */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-red-dim border border-red/20 rounded-lg px-4 py-3">
          <div className="text-10 font-mono uppercase tracking-wide-3 text-red font-semibold mb-1">Fine schedule</div>
          <div className="text-12 text-ink-1">AED <strong className="text-red">200,000 per violation</strong> for failure to file DPMSR on a ≥ AED 55,000 cash transaction. CR71/2024.</div>
        </div>
        <div className="bg-amber-dim border border-amber/20 rounded-lg px-4 py-3">
          <div className="text-10 font-mono uppercase tracking-wide-3 text-amber font-semibold mb-1">Filing deadline</div>
          <div className="text-12 text-ink-1">DPMSR must be filed via goAML within <strong>24 hours</strong> of the triggering transaction. MLRO approval required before filing.</div>
        </div>
      </div>

      {/* Transaction evaluator */}
      <div className="mb-6">
        <EvaluateForm onResult={handleNewObligations} />
      </div>

      {/* Obligations queue */}
      <div className="text-12 font-semibold text-ink-2 uppercase tracking-wide-3 mb-3 font-mono">
        Filing queue — {obligations.length} obligation{obligations.length !== 1 ? "s" : ""}
      </div>

      {loading ? (
        <div className="py-10 text-center text-11 text-ink-3">Loading obligations…</div>
      ) : obligations.length === 0 ? (
        <div className="py-12 text-center bg-bg-panel border border-hair-2 rounded-lg">
          <div className="text-28 mb-2">✓</div>
          <div className="text-14 font-semibold text-ink-0 mb-1">No DPMSR obligations</div>
          <p className="text-12 text-ink-2">No cash transactions have reached the AED {THRESHOLD_AED.toLocaleString()} threshold. Use the evaluator above to assess transactions.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {obligations.map((o) => {
            const expanded = expandedId === o.id;
            const isBusy = saving === o.id;
            return (
              <div key={o.id} className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
                <div
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bg-2 transition-colors ${expanded ? "bg-bg-2 border-b border-hair" : ""}`}
                  onClick={() => setExpandedId(expanded ? null : o.id)}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedId(expanded ? null : o.id); }}
                >
                  <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-10 font-semibold uppercase ${STATUS_TONE[o.status]}`}>
                    {STATUS_LABEL[o.status]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-13 font-semibold text-ink-0">
                      AED {o.totalAmountAed.toLocaleString()} — {o.triggerType === "single" ? "Single transaction" : "Linked transactions"}
                    </div>
                    <div className="text-10 text-ink-3 font-mono">
                      {o.customerName ?? o.customerId ?? "Unknown customer"} · {o.transactionIds.join(", ")}
                    </div>
                  </div>
                  <DeadlineBadge deadline={o.deadlineDate} status={o.status} />
                  <span className="text-10 text-ink-3 font-mono shrink-0 hidden md:block">{new Date(o.createdAt).toLocaleDateString("en-GB")}</span>
                  <span className="text-ink-3 font-mono text-12">{expanded ? "▾" : "▸"}</span>
                </div>

                {expanded && (
                  <div className="px-4 pb-4 pt-3 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-11">
                      {[
                        { label: "Trigger type", val: o.triggerType },
                        { label: "Legal basis", val: o.legalBasis },
                        { label: "MLRO sign-off", val: o.mlroSignedOff ? `✓ ${o.mlroSignedOffAt ? new Date(o.mlroSignedOffAt).toLocaleDateString("en-GB") : ""}` : "Pending" },
                        { label: "goAML ref", val: o.goAmlRef ?? "—" },
                      ].map(({ label, val }) => (
                        <div key={label} className="bg-bg-1 rounded p-2">
                          <div className="text-9 font-mono uppercase tracking-wide-3 text-ink-3 mb-0.5">{label}</div>
                          <div className="text-12 text-ink-0 font-medium">{val}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!o.mlroSignedOff && (
                        <button type="button" onClick={() => void handlePatch(o.id, { mlroSignedOff: true })} disabled={isBusy}
                          className="text-11 font-semibold px-3 py-1.5 rounded border border-green/40 text-green bg-green-dim hover:bg-green/20 disabled:opacity-50">
                          ✓ MLRO sign-off
                        </button>
                      )}
                      {o.status !== "filed" && (
                        <button type="button" onClick={() => void handlePatch(o.id, { status: "filed" as const })} disabled={isBusy || !o.mlroSignedOff}
                          title={!o.mlroSignedOff ? "MLRO sign-off required" : "Mark as filed in goAML"}
                          className="text-11 font-semibold px-3 py-1.5 rounded border border-amber/40 text-amber bg-amber-dim hover:bg-amber/20 disabled:opacity-40">
                          Mark as filed in goAML
                        </button>
                      )}
                      <a href="/goaml-export" className="text-11 font-semibold px-3 py-1.5 rounded border border-hair-2 text-ink-1 hover:bg-bg-2 no-underline">
                        Open goAML Export ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-10.5 text-ink-3 mt-6 leading-relaxed">
        DPMSR is a mandatory cash transaction report separate from STR/SAR. Threshold: AED {THRESHOLD_AED.toLocaleString()} single or linked cash.
        Legal basis: CR134/2025 Art.3. Fine: AED 200,000 per violation. File via goAML using report code DPMSR.
        Records must be retained for 5 years per FDL 10/2025 Art.19(d).
      </p>
    </ModuleLayout>
  );
}
