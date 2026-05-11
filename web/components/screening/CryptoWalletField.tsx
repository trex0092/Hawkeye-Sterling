"use client";

import { useState, useRef, useEffect } from "react";
import { fetchJson } from "@/lib/api/fetchWithRetry";

interface Props {
  wallets: string[];
  onChange: (wallets: string[]) => void;
}

interface WalletRisk {
  address: string;
  risk: "clear" | "low" | "medium" | "high" | "critical";
  source?: string;
  detail?: string;
}

interface CryptoRiskApi {
  ok: boolean;
  risk?: WalletRisk["risk"];
  source?: string;
  detail?: string;
  error?: string;
}

// Multi-wallet input. Calls /api/crypto-risk on blur for each newly-added
// address so the analyst sees an inline risk badge before the subject is
// even saved.
export function CryptoWalletField({ wallets, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const [risks, setRisks] = useState<Record<string, WalletRisk>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const lookup = async (address: string) => {
    setLoading((prev) => new Set([...prev, address]));
    const res = await fetchJson<CryptoRiskApi>("/api/crypto-risk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
      label: "Wallet risk lookup failed",
      timeoutMs: 10_000,
    });
    if (mountedRef.current) {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(address);
        return next;
      });
    }
    if (mountedRef.current && res.ok && res.data?.ok && res.data.risk) {
      const entry: WalletRisk = {
        address,
        risk: res.data.risk,
        ...(res.data.source ? { source: res.data.source } : {}),
        ...(res.data.detail ? { detail: res.data.detail } : {}),
      };
      setRisks((prev) => ({ ...prev, [address]: entry }));
    }
  };

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (wallets.some((w) => w.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...wallets, v]);
    setDraft("");
    void lookup(v);
  };

  const remove = (addr: string) => {
    onChange(wallets.filter((w) => w !== addr));
    setRisks((prev) => {
      const next = { ...prev };
      delete next[addr];
      return next;
    });
  };

  const riskTones: Record<WalletRisk["risk"], string> = {
    critical: "bg-red text-white",
    high: "bg-red-dim text-red",
    medium: "bg-amber-dim text-amber",
    low: "bg-amber-dim text-amber",
    clear: "bg-green-dim text-green",
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="0x… / bc1… / TR… (Enter to add)"
          className="w-full bg-transparent border border-hair-2 rounded px-2.5 py-1.5 text-13 text-ink-0 placeholder-ink-3 focus:outline-none focus:border-brand focus:bg-bg-panel font-mono"
        />
      </div>
      {wallets.length > 0 && (
        <ul className="mt-2 space-y-1">
          {wallets.map((w) => {
            const r = risks[w];
            const isLoading = loading.has(w);
            return (
              <li key={w} className="flex items-center gap-2 text-11 bg-bg-1 border border-hair-2 rounded px-2 py-1">
                <span className="font-mono text-ink-0 truncate flex-1">{w}</span>
                {isLoading && <span className="text-10 text-ink-3 animate-pulse">checking…</span>}
                {r && (
                  <span
                    className={`text-10 px-1.5 py-px rounded font-semibold uppercase ${riskTones[r.risk]}`}
                    title={[r.source, r.detail].filter(Boolean).join(" - ")}
                  >
                    {r.risk}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(w)}
                  className="text-ink-3 hover:text-red text-12 leading-none"
                  aria-label={`Remove ${w}`}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
