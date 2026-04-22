"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
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

export default function TransactionMonitorPage() {
  const [txs, setTxs] = useState<TxRow[]>([]);
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
    clear();
  };

  const runDailyScan = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/transaction-monitor/run", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; totalAlerts?: number };
      flashFor(
        data.ok
          ? `Scan complete — ${data.totalAlerts ?? 0} alerts`
          : "Scan failed",
      );
    } catch {
      flashFor("Scan failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Header />
      <main className="min-h-[calc(100vh-54px)] bg-bg-0">
        <ModuleShell>
          <ModuleHeader
            title="Transaction Monitor"
            subtitle="Module 08 · MoE Circular 08/AML/2021 · DPMS threshold AED 55,000 · FATF Rec. 20"
            dotColor="amber"
            actions={
              <>
                <Btn variant="ghost" onClick={runDailyScan} disabled={running}>
                  {running ? "Running scan…" : "Run daily scan"}
                </Btn>
                <Btn variant="primary">+ Add transaction</Btn>
              </>
            }
          />

          <KpiGrid cols={3}>
            <Kpi value={txs.length} label="Transactions" tone="brand" />
            <Kpi value={alerts} label="Alerts" tone="amber" />
            <Kpi value={reportable} label="Reportable (DPMS ≥ 55k)" tone="red" />
          </KpiGrid>

          <Card>
            <form onSubmit={log}>
              <CardSection title="Transaction identity">
                <div className="grid gap-5 grid-cols-1 md:grid-cols-2">
                  <Field label="Transaction reference">
                    <input
                      value={ref}
                      onChange={(e) => setRef(e.target.value)}
                      className={textInputCls}
                    />
                  </Field>
                  <Field label="Counterparty">
                    <input
                      value={counterparty}
                      onChange={(e) => setCounterparty(e.target.value)}
                      placeholder="Customer / entity name"
                      className={textInputCls}
                    />
                  </Field>
                </div>
              </CardSection>

              <CardSection title="Amount & timing">
                <div className="grid gap-5 grid-cols-1 md:grid-cols-3">
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
                  <Field label="Occurred on" hint="(dd/mm/yyyy)">
                    <input
                      value={occurredOn}
                      onChange={(e) => setOccurredOn(e.target.value)}
                      placeholder="dd/mm/yyyy"
                      className={textInputCls}
                    />
                  </Field>
                </div>
              </CardSection>

              <CardSection title="Channel & routing">
                <div className="grid gap-5 grid-cols-1 md:grid-cols-3">
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
                <div className="grid gap-5 grid-cols-1 md:grid-cols-2">
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
            <div className="mt-8 bg-white border border-hair-2 rounded-xl overflow-hidden">
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
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-hair last:border-0 hover:bg-bg-1"
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ModuleShell>
      </main>
    </>
  );
}
