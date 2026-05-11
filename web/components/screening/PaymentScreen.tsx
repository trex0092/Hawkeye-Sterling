"use client";

import { useState, useRef, useEffect } from "react";

// SWIFT MT103 / SEPA XML payment-rail screener. Paste a raw payment
// message; the server parses it, screens ordering + beneficiary parties
// against the live sanctions corpus, and returns a verdict.
//
// Designed as a card that slots anywhere on the transaction-monitor
// page (or /screening for that matter). No prop wiring — it manages
// its own state.

interface PaymentVerdict {
  ok: boolean;
  parsed?:
    | {
        reference?: string | undefined;
        valueDate?: string | undefined;
        currency?: string | undefined;
        amount?: string | undefined;
        ordering?:
          | {
              account?: string | undefined;
              name?: string | undefined;
              address?: string | undefined;
            }
          | undefined;
        beneficiary?:
          | {
              account?: string | undefined;
              name?: string | undefined;
              address?: string | undefined;
            }
          | undefined;
        remittance?: string | undefined;
      }
    | undefined;
  orderingScreen?:
    | {
        severity: string;
        topScore: number;
        hits: Array<{ listId: string; candidateName: string; score: number }>;
      }
    | null
    | undefined;
  beneficiaryScreen?:
    | {
        severity: string;
        topScore: number;
        hits: Array<{ listId: string; candidateName: string; score: number }>;
      }
    | null
    | undefined;
  verdict?:
    | {
        worseSeverity: string;
        shouldBlock: boolean;
      }
    | undefined;
  error?: string | undefined;
}

const SEVERITY_TONE: Record<string, string> = {
  clear: "bg-green-dim text-green",
  low: "bg-blue-dim text-blue",
  medium: "bg-amber-dim text-amber",
  high: "bg-orange-dim text-orange",
  critical: "bg-red text-white",
};

const EXAMPLE_MT103 = `:20:TXN2026042300001
:32A:260423USD100000,00
:50K:/IBAN RU40 1234 5678 9012 3456
VOLKOV DMITRI
MOSCOW, RUSSIAN FEDERATION
:59:/IBAN AE07 0331 2345 6789 0123 456
DEMO BULLION FZE
DUBAI, UAE
:70:GOLD IMPORT CONTRACT #2026-04`;

export function PaymentScreen() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<PaymentVerdict | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const screen = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payment-screen", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message }),
      });
      const payload = (await res.json()) as PaymentVerdict;
      if (mountedRef.current) setResult(payload);
    } catch (err) {
      if (mountedRef.current) setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Payment screen failed",
      });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-4 mt-6">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-12 font-semibold text-ink-0 m-0 uppercase tracking-wide-3">
          SWIFT MT103 payment-rail screening
        </h2>
        <button
          type="button"
          onClick={() => setMessage(EXAMPLE_MT103)}
          className="text-11 font-mono text-ink-3 hover:text-ink-1"
          title="Paste an example MT103 so you can see the screener fire"
        >
          try example
        </button>
      </div>
      <p className="text-11 text-ink-2 mb-3 leading-snug">
        Paste a raw SWIFT MT103 message. The parser extracts ordering
        customer (tag 50) and beneficiary (tag 59), screens each against
        the live OFAC / UN / EU / UK / EOCN / UAE-LTL corpus, and
        returns a block / clear verdict.
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder=":20:TXN…&#10;:32A:YYMMDDCCYN,NN&#10;:50K:/IBAN …&#10;NAME&#10;:59:/IBAN …&#10;NAME&#10;:70:remittance"
        rows={8}
        className="w-full border border-hair-2 rounded px-3 py-2 font-mono text-11 bg-bg-0 text-ink-0 resize-y"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={screen}
          disabled={loading || !message.trim()}
          className="text-11 font-semibold bg-ink-0 text-bg-0 px-3 py-1.5 rounded hover:bg-ink-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Screening…" : "Screen payment"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMessage("");
            setResult(null);
          }}
          className="text-11 font-medium text-ink-2 px-2 py-1.5 hover:text-ink-0"
        >
          Clear
        </button>
      </div>

      {result && !result.ok && (
        <div className="mt-3 bg-red-dim text-red rounded px-3 py-2 text-12">
          {result.error ?? "Unknown error"}
        </div>
      )}

      {result?.ok && (
        <div className="mt-4 space-y-3">
          {result.verdict && (
            <div className="flex items-center gap-3">
              <span className="text-10.5 uppercase tracking-wide-4 text-ink-2 font-semibold">
                Verdict
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-11 font-semibold uppercase ${SEVERITY_TONE[result.verdict.worseSeverity] ?? ""}`}
              >
                {result.verdict.worseSeverity}
              </span>
              {result.verdict.shouldBlock && (
                <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-11 font-semibold bg-red text-white uppercase">
                  BLOCK · do not release funds
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PartyCard
              label="Ordering customer"
              party={result.parsed?.ordering}
              screen={result.orderingScreen ?? null}
            />
            <PartyCard
              label="Beneficiary"
              party={result.parsed?.beneficiary}
              screen={result.beneficiaryScreen ?? null}
            />
          </div>

          <div className="text-10.5 font-mono text-ink-3">
            Ref: {result.parsed?.reference ?? "—"} · Value date:{" "}
            {result.parsed?.valueDate ?? "—"} · Amount:{" "}
            {result.parsed?.currency} {result.parsed?.amount}
            {result.parsed?.remittance && (
              <span> · Remittance: {result.parsed.remittance}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PartyCard({
  label,
  party,
  screen,
}: {
  label: string;
  party?:
    | {
        account?: string | undefined;
        name?: string | undefined;
        address?: string | undefined;
      }
    | undefined;
  screen: {
    severity: string;
    topScore: number;
    hits: Array<{ listId: string; candidateName: string; score: number }>;
  } | null;
}) {
  return (
    <div className="bg-bg-1 rounded p-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-10.5 uppercase tracking-wide-3 text-ink-2 font-semibold">
          {label}
        </span>
        {screen && (
          <span
            className={`inline-flex items-center px-1.5 py-px rounded font-mono text-10 font-semibold uppercase ${SEVERITY_TONE[screen.severity] ?? ""}`}
          >
            {screen.severity} · {screen.topScore}
          </span>
        )}
      </div>
      {party?.name ? (
        <>
          <div className="text-12 font-medium text-ink-0">{party.name}</div>
          {party.account && (
            <div className="font-mono text-10 text-ink-3 mt-0.5">
              {party.account}
            </div>
          )}
          {party.address && (
            <div className="text-10.5 text-ink-2 mt-0.5">{party.address}</div>
          )}
        </>
      ) : (
        <div className="text-11 text-ink-3 italic">Not parsed</div>
      )}
      {screen && screen.hits.length > 0 && (
        <div className="mt-2 pt-2 border-t border-hair">
          <div className="text-10 uppercase tracking-wide-3 text-ink-2 font-semibold mb-1">
            Hits
          </div>
          {screen.hits.slice(0, 3).map((h, i) => (
            <div
              key={h.candidateName ?? i}
              className="font-mono text-10 text-ink-0 flex justify-between"
            >
              <span>
                [{h.listId}] {h.candidateName}
              </span>
              <span className="text-ink-2">{Math.round(h.score * 100)}%</span>
            </div>
          ))}
          {screen.hits.length > 3 && (
            <div className="font-mono text-10 text-ink-3">
              … and {screen.hits.length - 3} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
