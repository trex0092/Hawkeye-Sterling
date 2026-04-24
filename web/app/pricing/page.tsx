"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import type { TierDefinition } from "@/lib/data/tiers";

export default function PricingPage() {
  const [tiers, setTiers] = useState<TierDefinition[]>([]);
  const [signup, setSignup] = useState<{
    open: boolean;
    tier: string;
    name: string;
    email: string;
    apiKey: string | null;
    err: string | null;
  }>({ open: false, tier: "free", name: "", email: "", apiKey: null, err: null });

  useEffect(() => {
    void fetch("/api/tiers")
      .then((r) => r.json())
      .then((p: { ok: boolean; tiers: TierDefinition[] }) => {
        if (p.ok) setTiers(p.tiers);
      })
      .catch(() => {});
  }, []);

  const openFor = (tier: string) =>
    setSignup({ open: true, tier, name: "", email: "", apiKey: null, err: null });

  const submitSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignup((s) => ({ ...s, err: null }));
    const r = await fetch("/api/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tier: signup.tier,
        name: signup.name,
        email: signup.email,
      }),
    });
    const payload = (await r.json()) as
      | { ok: true; apiKey: string; warning: string }
      | { ok: false; error?: string };
    if (payload.ok) {
      setSignup((s) => ({ ...s, apiKey: payload.apiKey }));
    } else {
      setSignup((s) => ({ ...s, err: payload.error ?? "signup failed" }));
    }
  };

  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="font-display text-48 text-ink-0 mb-1">Pricing</h1>
        <p className="text-12 text-ink-2 mb-8">
          Instant API key signup. No sales cycle. Annual contracts available on
          Pro and Enterprise.
        </p>

        <div className="grid grid-cols-4 gap-4 mb-10">
          {tiers.map((t) => (
            <div
              key={t.id}
              className={`bg-bg-panel rounded-lg p-5 border ${
                t.id === "pro" ? "border-brand" : "border-hair-2"
              }`}
            >
              <div className="text-12 font-semibold uppercase tracking-wide-4 text-ink-2 mb-2">
                {t.label}
              </div>
              <div className="font-display text-36 text-ink-0 leading-none mb-1">
                {t.priceUsdMonthly === null
                  ? "Custom"
                  : t.priceUsdMonthly === 0
                    ? "$0"
                    : `$${t.priceUsdMonthly}`}
                {t.priceUsdMonthly && t.priceUsdMonthly > 0 && (
                  <span className="text-12 text-ink-3"> /mo</span>
                )}
              </div>
              <div className="text-11 text-ink-2 mb-4 font-mono">
                {t.monthlyQuota === null
                  ? "Unlimited screenings"
                  : `${t.monthlyQuota.toLocaleString()} screenings/mo`}
                {" · "}
                {t.rateLimitPerMinute} rpm
              </div>
              <ul className="list-none p-0 m-0 mb-5 space-y-1.5">
                {t.features.map((f) => (
                  <li key={f} className="text-11.5 text-ink-1 leading-tight">
                    · {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => openFor(t.id)}
                className={`w-full rounded px-3 py-2 text-12 font-semibold ${
                  t.id === "pro" || t.id === "enterprise"
                    ? "bg-brand text-white"
                    : "bg-bg-2 text-ink-0 border border-hair-2"
                }`}
              >
                {t.priceUsdMonthly === null
                  ? "Contact sales"
                  : t.priceUsdMonthly === 0
                    ? "Start free"
                    : "Subscribe"}
              </button>
              <div className="mt-2 text-10 text-ink-3 font-mono">
                SLA {t.uptimeSla}% · monitoring {t.monitoringSubjects.toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {signup.open && !signup.apiKey && (
          <form onSubmit={submitSignup} className="bg-bg-panel border border-hair-2 rounded-lg p-5 mb-6">
            <div className="text-12 font-semibold uppercase tracking-wide-4 text-ink-2 mb-3">
              Sign up — {signup.tier}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input
                required
                placeholder="Name"
                className="rounded border border-hair-2 bg-bg-panel px-3 py-2 text-13"
                value={signup.name}
                onChange={(e) => setSignup((s) => ({ ...s, name: e.target.value }))}
              />
              <input
                required
                type="email"
                placeholder="Email"
                className="rounded border border-hair-2 bg-bg-panel px-3 py-2 text-13"
                value={signup.email}
                onChange={(e) =>
                  setSignup((s) => ({ ...s, email: e.target.value }))
                }
              />
            </div>
            {signup.err && (
              <div className="bg-red-dim text-red rounded px-3 py-2 text-11 mb-3">
                {signup.err}
              </div>
            )}
            <button
              type="submit"
              className="bg-brand text-white font-semibold rounded px-4 py-2 text-12"
            >
              Issue API key
            </button>
          </form>
        )}

        {signup.apiKey && (
          <div className="bg-green-dim text-green rounded-lg p-5 mb-6">
            <div className="font-semibold mb-2">Your API key</div>
            <div className="font-mono text-12 text-ink-0 break-all bg-bg-panel rounded px-3 py-2 border border-green/20">
              {signup.apiKey}
            </div>
            <div className="text-11 text-ink-2 mt-2">
              Store this key securely — it will never be shown again. Use it as
              <code> Authorization: Bearer {"<key>"}</code> on every API call.
            </div>
          </div>
        )}

        <div className="bg-bg-1 border border-hair-2 rounded-lg p-4 text-12 text-ink-1">
          <strong>Transparent rate limits.</strong> Every response returns
          <code> x-ratelimit-remaining-minute</code> /{" "}
          <code>x-ratelimit-remaining-second</code> headers. Overages on paid
          tiers are billed at 1/10th of the next-tier per-screening rate.
        </div>
      </main>
    </>
  );
}
