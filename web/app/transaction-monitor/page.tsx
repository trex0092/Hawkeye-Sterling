"use client";

import { useEffect, useRef, useState } from "react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import {
  ModuleHeader,
  Kpi,
  KpiGrid,
  Card,
  ActionRow,
  Btn,
  Register,
} from "@/components/ui/ModuleShell";
import { MultiSelect, SingleSelect } from "@/components/ui/MultiSelect";
import { DateParts } from "@/components/ui/DateParts";
import { fetchJson } from "@/lib/api/fetchWithRetry";
import { ReportModal } from "@/components/reports/ReportModal";
import { RowActions } from "@/components/shared/RowActions";
import { AsanaStatus } from "@/components/shared/AsanaStatus";
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
  /** Asana task permalink for the transaction-monitor alert posted to
   *  board 08. Renders the green "Reported to Asana · view task" pill
   *  on the transaction row alongside the ref. */
  asanaTaskUrl?: string;
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
            title="Transaction"
            titleEm="Monitor"
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
              {(() => {
                const iCls = "w-full bg-bg-1 border border-hair-2 rounded px-2.5 py-1.5 text-12 text-ink-0 focus:outline-none focus:border-brand";
                const taCls = `${iCls} min-h-[56px] leading-relaxed resize-y`;
                const lCls = "block text-10 uppercase tracking-wide-3 text-ink-3 mb-1";
                const row = "grid gap-3 mb-2";
                return (
                  <>
                    <div className={`${row} grid-cols-2`}>
                      <div><label className={lCls}>Transaction reference</label><input value={ref} onChange={(e) => setRef(e.target.value)} className={iCls} /></div>
                      <div><label className={lCls}>Counterparty</label><input ref={counterpartyRef} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Customer / entity name" className={iCls} /></div>
                    </div>
                    <div className={`${row} grid-cols-3`}>
                      <div><label className={lCls}>Amount</label><input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={iCls} /></div>
                      <div><label className={lCls}>Currency <span className="normal-case font-normal">(original)</span></label><input value={currency} onChange={(e) => setCurrency(e.target.value)} className={iCls} /></div>
                      <div><label className={lCls}>Occurred on</label><DateParts value={occurredOn} onChange={setOccurredOn} className={iCls} /></div>
                    </div>
                    <div className={`${row} grid-cols-3`}>
                      <div><label className={lCls}>Channel</label><SingleSelect options={TM_CHANNELS} value={channel} onChange={setChannel} /></div>
                      <div><label className={lCls}>Direction</label><SingleSelect options={TM_DIRECTIONS} value={direction} onChange={setDirection} /></div>
                      <div><label className={lCls}>Counterparty country</label><input value={counterpartyCountry} onChange={(e) => setCounterpartyCountry(e.target.value)} placeholder="e.g. UAE, IN, CH" className={iCls} /></div>
                    </div>
                    <div className={`${row} grid-cols-2`}>
                      <div><label className={lCls}>Payment method / rails</label><input value={paymentRails} onChange={(e) => setPaymentRails(e.target.value)} placeholder="e.g. Emirates NBD, Al Etihad, cash drop" className={iCls} /></div>
                      <div><label className={lCls}>Source of funds declared</label><input value={sourceOfFunds} onChange={(e) => setSourceOfFunds(e.target.value)} placeholder="e.g. salary, business revenue, inheritance" className={iCls} /></div>
                    </div>
                    <div className="mb-2"><label className={lCls}>Behavioural flags</label><MultiSelect groups={TM_BEHAVIOURAL_FLAGS} placeholder="Select behavioural flag…" value={behaviouralFlags} onChange={setBehaviouralFlags} /></div>
                    <div className="mb-2"><label className={lCls}>Analyst notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Behavioural context, observed pattern, linked STR reference…" className={taCls} /></div>
                  </>
                );
              })()}

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
                      <td className="px-3 py-2 font-mono text-ink-2">
                        {t.ref}
                        {t.asanaTaskUrl && (
                          <AsanaStatus
                            state={{ status: "sent", taskUrl: t.asanaTaskUrl }}
                            className="ml-2 align-middle"
                          />
                        )}
                      </td>
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
                      <td className="px-2 py-2 text-right">
                        <RowActions
                          label={t.ref}
                          onEdit={() => {
                            setReportTx(t);
                          }}
                          onDelete={() => {
                            setTxs((prev) => prev.filter((x) => x.id !== t.id));
                          }}
                          confirmDelete={false}
                        />
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
        onAsanaFiled={(taskUrl) => {
          // Persist the Asana permalink against the row so the green
          // "Reported to Asana · view task" pill shows next to the
          // ref column on subsequent renders + reloads.
          if (!reportTx) return;
          setTxs((prev) =>
            prev.map((x) => (x.id === reportTx.id ? { ...x, asanaTaskUrl: taskUrl } : x)),
          );
        }}
      />
    </ModuleLayout>
  );
}
