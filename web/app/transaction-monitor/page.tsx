"use client";

import { useEffect, useRef, useState } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import {
  ModuleShell,
  ModuleHeader,
  Kpi,
  KpiGrid,
  Card,
  CardSection,
  Field,
  ActionRow,
  Btn,
  Register,
  textInputCls,
  textareaCls,
} from "@/components/ui/ModuleShell";
import { MultiSelect, SingleSelect } from "@/components/ui/MultiSelect";
import { DateParts } from "@/components/ui/DateParts";
import { fetchJson } from "@/lib/api/fetchWithRetry";
import { ReportModal } from "@/components/reports/ReportModal";
import { PaymentScreen } from "@/components/screening/PaymentScreen";
import {
  TM_CHANNELS,
  TM_DIRECTIONS,
  TM_BEHAVIOURAL_FLAGS,
} from "@/lib/data/tm-taxonomy";

interface TxRow {
  id: string;
  ref: string;
  counterparty: string;
  amount: string;
  currency: string;
  occurredOn: string;
  channel: string;
  direction: string;
  counterpartyCountry: string;
  behaviouralFlags: string[];
  notes: string;
  loggedAt: string;
}

const THRESHOLD_AED = 55_000;
const STORAGE_KEY = "hawkeye.transaction-monitor.v1";

// Shape a logged transaction into the compliance-report payload so
// clicking a row renders the same MLRO dossier the screening panel
// produces, with the transaction standing in as the "subject".
function txToReportPayload(t: TxRow): unknown {
  const amt = Number.parseFloat(t.amount.replace(/,/g, "")) || 0;
  const reportable = t.channel === "Cash (DPMS)" && amt >= THRESHOLD_AED;
  return {
    subject: {
      id: t.ref,
      name: t.counterparty,
      entityType: "organisation" as const,
      jurisdiction: t.counterpartyCountry || undefined,
      group: t.channel,
    },
    result: {
      topScore: reportable ? 70 : t.behaviouralFlags.length > 0 ? 45 : 10,
      severity: reportable
        ? ("high" as const)
        : t.behaviouralFlags.length > 0
          ? ("medium" as const)
          : ("low" as const),
      hits: [],
    },
    superBrain: {
      adverseKeywordGroups: t.behaviouralFlags.map((f, i) => ({
        group: `flag_${i}`,
        label: f,
        count: 1,
      })),
    },
  };
}

function loadTxs(): TxRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TxRow[]) : [];
  } catch {
    return [];
  }
}

export default function TransactionMonitorPage() {
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const counterpartyRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    setTxs(loadTxs());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(txs));
    } catch {
      /* quota / disabled storage — just skip */
    }
  }, [txs, hydrated]);
  const [ref, setRef] = useState(`TXN-2026-${String(Date.now()).slice(-4)}`);
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [occurredOn, setOccurredOn] = useState("");
  const [channel, setChannel] = useState("Cash (DPMS)");
  const [direction, setDirection] = useState("Inbound");
  const [counterpartyCountry, setCounterpartyCountry] = useState("");
  const [paymentRails, setPaymentRails] = useState("");
  const [sourceOfFunds, setSourceOfFunds] = useState("");
  const [behaviouralFlags, setBehaviouralFlags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [reportTx, setReportTx] = useState<TxRow | null>(null);

  const openTxReport = (t: TxRow): void => setReportTx(t);
  const closeTxReport = (): void => setReportTx(null);

  const parsedAmount = Number.parseFloat(amount.replace(/,/g, "")) || 0;
  const alerts = txs.filter((t) => t.behaviouralFlags.length > 0).length;
  const reportable = txs.filter((t) => {
    const amt = Number.parseFloat(t.amount.replace(/,/g, "")) || 0;
    return t.channel === "Cash (DPMS)" && amt >= THRESHOLD_AED;
  }).length;

  const valid = counterparty.trim().length > 0 && parsedAmount > 0;

  const flashFor = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2500);
  };

  const focusForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => counterpartyRef.current?.focus(), 250);
  };

  const clear = () => {
    setRef(`TXN-2026-${String(Date.now()).slice(-4)}`);
    setCounterparty("");
    setAmount("");
    setCurrency("AED");
    setOccurredOn("");
    setChannel("Cash (DPMS)");
    setDirection("Inbound");
    setCounterpartyCountry("");
    setPaymentRails("");
    setSourceOfFunds("");
    setBehaviouralFlags([]);
    setNotes("");
  };

  const log = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const row: TxRow = {
      id: `tx-${Date.now()}`,
      ref,
      counterparty: counterparty.trim(),
      amount,
      currency,
      occurredOn,
      channel,
      direction,
      counterpartyCountry,
      behaviouralFlags,
      notes,
      loggedAt: new Date().toISOString(),
    };
    setTxs((prev) => [row, ...prev]);
    flashFor(
      row.behaviouralFlags.length > 0
        ? "Transaction logged — behavioural flags fired"
        : "Transaction logged",
    );
    // Best-effort Asana filing to the Transaction-Monitor board. We don't
    // surface failure (screening-panel pattern): the tx is on the register
    // regardless; Asana misconfig surfaces via the backend logs.
    void fetch("/api/tm-report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transaction: row }),
    }).catch(() => {
      /* tx is logged locally; Asana is best-effort */
    });
    clear();
  };

  const runDailyScan = async () => {
    setRunning(true);
    try {
      // Retry-aware POST. Surfaces colon-free messages (`Scan failed
      // server 502`) and tolerates Netlify cold-start 502s up to
      // 3 retries × 750ms before giving up.
      const res = await fetchJson<{ ok: boolean; totalAlerts?: number }>(
        "/api/transaction-monitor/run",
        { method: "POST", label: "Scan failed" },
      );
      if (!res.ok) {
        flashFor(res.error ?? "Scan failed");
        return;
      }
      flashFor(
        res.data?.ok
          ? `Scan complete ${res.data.totalAlerts ?? 0} alerts`
          : "Scan failed",
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <ModuleLayout asanaModule="transaction-monitor" asanaLabel="Transaction Monitor">
      <ModuleHeader
            title="Transaction Monitor"
            subtitle="Module 08 · MoE Circular 08/AML/2021 · DPMS threshold AED 55,000 · FATF Rec. 20"
            dotColor="amber"
            actions={
              <>
                <Btn variant="ghost" onClick={runDailyScan} disabled={running}>
                  {running ? "Running scan…" : "Run daily scan"}
                </Btn>
                <Btn variant="primary" onClick={focusForm}>
                  + Add transaction
                </Btn>
              </>
            }
      />

      <KpiGrid cols={3}>
            <Kpi value={txs.length} label="Transactions" tone="brand" />
            <Kpi value={alerts} label="Alerts" tone="amber" />
            <Kpi value={reportable} label="Reportable (DPMS ≥ 55k)" tone="red" />
      </KpiGrid>

      <Card>
            <form ref={formRef} onSubmit={log}>
              <CardSection title="Transaction identity">
                <div className="grid gap-x-3 gap-y-1.5 grid-cols-1 md:grid-cols-2">
                  <Field label="Transaction reference">
                    <input
                      value={ref}
                      onChange={(e) => setRef(e.target.value)}
                      className={textInputCls}
                    />
                  </Field>
                  <Field label="Counterparty">
                    <input
                      ref={counterpartyRef}
                      value={counterparty}
                      onChange={(e) => setCounterparty(e.target.value)}
                      placeholder="Customer / entity name"
                      className={textInputCls}
                    />
                  </Field>
                </div>
              </CardSection>

              <CardSection title="Amount & timing">
                <div className="grid gap-x-3 gap-y-1.5 grid-cols-1 md:grid-cols-3">
                  <Field label="Amount" hint="(AED)">
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className={textInputCls}
                    />
                  </Field>
                  <Field label="Currency" hint="(original)">
                    <input
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className={textInputCls}
                    />
                  </Field>
                  <Field label="Occurred on">
                    <DateParts
                      value={occurredOn}
                      onChange={setOccurredOn}
                      className={textInputCls}
                    />
                  </Field>
                </div>
              </CardSection>

              <CardSection title="Channel & routing">
                <div className="grid gap-x-3 gap-y-1.5 grid-cols-1 md:grid-cols-3">
                  <Field label="Channel">
                    <SingleSelect
                      options={TM_CHANNELS}
                      value={channel}
                      onChange={setChannel}
                    />
                  </Field>
                  <Field label="Direction">
                    <SingleSelect
                      options={TM_DIRECTIONS}
                      value={direction}
                      onChange={setDirection}
                    />
                  </Field>
                  <Field label="Counterparty country">
                    <input
                      value={counterpartyCountry}
                      onChange={(e) => setCounterpartyCountry(e.target.value)}
                      placeholder="e.g. UAE, IN, CH"
                      className={textInputCls}
                    />
                  </Field>
                </div>
                <div className="grid gap-x-3 gap-y-1.5 grid-cols-1 md:grid-cols-2">
                  <Field label="Payment method / rails">
                    <input
                      value={paymentRails}
                      onChange={(e) => setPaymentRails(e.target.value)}
                      placeholder="e.g. Emirates NBD, Al Etihad, cash drop"
                      className={textInputCls}
                    />
                  </Field>
                  <Field label="Source of funds declared">
                    <input
                      value={sourceOfFunds}
                      onChange={(e) => setSourceOfFunds(e.target.value)}
                      placeholder="e.g. salary, business revenue, inheritance"
                      className={textInputCls}
                    />
                  </Field>
                </div>
              </CardSection>

              <CardSection title="Behavioural flags">
                <MultiSelect
                  groups={TM_BEHAVIOURAL_FLAGS}
                  placeholder="Select behavioural flag…"
                  value={behaviouralFlags}
                  onChange={setBehaviouralFlags}
                />
              </CardSection>

              <CardSection title="Analyst notes">
                <Field label="Notes">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Behavioural context, observed pattern, linked STR reference…"
                    className={textareaCls}
                  />
                </Field>
              </CardSection>

              {flash && (
                <div className="text-11 text-green font-medium mb-3" role="status">
                  {flash}
                </div>
              )}

              <ActionRow
                left={
                  <>
                    <Btn type="submit" variant="primary" disabled={!valid}>
                      Log transaction
                    </Btn>
                    <Btn variant="secondary" onClick={clear}>
                      Cancel
                    </Btn>
                  </>
                }
                right={
                  <span className="font-mono text-10 uppercase tracking-wide-3 px-3 py-1.5 rounded-full border border-hair-3 bg-bg-2 text-ink-1">
                    Critical alerts auto-open an Asana case
                  </span>
                }
              />
            </form>
      </Card>

      {txs.length === 0 ? (
            <Register empty="No transactions being monitored." />
      ) : (
            <div className="mt-8 bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
              <table className="w-full text-12">
                <thead className="bg-bg-1 border-b border-hair-2">
                  <tr>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Ref
                    </th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Counterparty
                    </th>
                    <th className="text-right px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Amount
                    </th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Channel
                    </th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Direction
                    </th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Flags
                    </th>
                    <th className="text-left px-3 py-2 text-10 uppercase tracking-wide-3 text-ink-2 font-mono">
                      Logged
                    </th>
                    <th className="w-[40px]" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => openTxReport(t)}
                      className="border-b border-hair last:border-0 hover:bg-bg-1 cursor-pointer"
                    >
                      <td className="px-3 py-2 font-mono text-ink-2">{t.ref}</td>
                      <td className="px-3 py-2 text-ink-0">{t.counterparty}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {t.currency} {t.amount}
                      </td>
                      <td className="px-3 py-2 text-ink-1">{t.channel}</td>
                      <td className="px-3 py-2 text-ink-1">{t.direction}</td>
                      <td className="px-3 py-2">
                        {t.behaviouralFlags.length > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 bg-red-dim text-red">
                            {t.behaviouralFlags.length}
                          </span>
                        ) : (
                          <span className="text-ink-3 font-mono text-10">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-10 text-ink-3">
                        {new Date(t.loggedAt).toLocaleString()}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          aria-label={`Delete ${t.ref}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTxs((prev) => prev.filter((x) => x.id !== t.id));
                          }}
                          className="w-7 h-7 rounded flex items-center justify-center text-ink-3 hover:bg-red-dim hover:text-red transition-colors"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
      )}
      <PaymentScreen />
      <ReportModal
        open={reportTx !== null}
        title={reportTx?.ref ?? ""}
        payload={reportTx ? txToReportPayload(reportTx) : null}
        onClose={closeTxReport}
        asanaFile={
      reportTx
            ? {
                endpoint: "/api/tm-report",
                body: { transaction: reportTx },
              }
            : null
        }
      />
    </ModuleLayout>
  );
}
