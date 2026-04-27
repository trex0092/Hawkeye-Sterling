"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

interface SherlockProfile { site: string; url: string; exists: boolean }
interface HarvesterResult { ok: boolean; emails: string[]; hosts: string[]; ips: string[]; error?: string }
interface SherlockResult { ok: boolean; username: string; profiles: SherlockProfile[]; totalFound: number; error?: string }
interface SocialProfile { platform: string; url: string; score: number }
interface SocialResult { ok: boolean; person: string; profiles: SocialProfile[]; error?: string }

type Mode = "domain" | "username";

const MODE_HINT: Record<Mode, string> = {
  domain: "Enter a domain (e.g. acme.ae) to harvest emails, hosts and IP addresses",
  username: "Enter a username or person name to search social platforms",
};

const inputCls = "flex-1 bg-bg-input border border-hair-2 rounded px-3 py-2 text-13 text-ink-0 placeholder-ink-3 focus:outline-none focus:border-brand";

export default function OsintPage() {
  const [mode, setMode] = useState<Mode>("domain");
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [domainResult, setDomainResult] = useState<HarvesterResult | null>(null);
  const [sherlockResult, setSherlockResult] = useState<SherlockResult | null>(null);
  const [socialResult, setSocialResult] = useState<SocialResult | null>(null);
  const [error, setError] = useState("");
  const [scannedAt, setScannedAt] = useState("");

  const run = async () => {
    const t = target.trim();
    if (!t) return;
    setLoading(true);
    setError("");
    setDomainResult(null);
    setSherlockResult(null);
    setSocialResult(null);

    try {
      if (mode === "domain") {
        const res = await fetch("/api/osint-bridge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tool: "harvester", domain: t }),
        });
        const data = (await res.json()) as HarvesterResult;
        if (!data.ok) setError(data.error ?? "Harvest failed");
        else { setDomainResult(data); setScannedAt(new Date().toLocaleTimeString()); }
      } else {
        const [sh, sa] = await Promise.allSettled([
          fetch("/api/osint-bridge", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tool: "sherlock", username: t }),
          }).then((r) => r.json() as Promise<SherlockResult>),
          fetch("/api/osint-bridge", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tool: "social-analyzer", person: t }),
          }).then((r) => r.json() as Promise<SocialResult>),
        ]);
        if (sh.status === "fulfilled") setSherlockResult(sh.value);
        if (sa.status === "fulfilled") setSocialResult(sa.value);
        setScannedAt(new Date().toLocaleTimeString());
        if (sh.status === "rejected" && sa.status === "rejected")
          setError("All OSINT tools failed — check the bridge service is running");
      }
    } catch {
      setError("Network error — check connectivity");
    } finally {
      setLoading(false);
    }
  };

  const hasResults = domainResult || sherlockResult || socialResult;

  return (
    <ModuleLayout asanaModule="intel" asanaLabel="OSINT Intelligence">
      <ModuleHero
        eyebrow="Enrichment · Open Source Intelligence"
        title="OSINT"
        titleEm="Intelligence."
        intro="Harvest open-source signals from public infrastructure, social platforms, and domain records via theHarvester, Sherlock, and Social Analyzer."
      />

      <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 mb-6">
        <div className="flex gap-2 mb-3">
          {(["domain", "username"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setDomainResult(null); setSherlockResult(null); setSocialResult(null); setError(""); }}
              className={`px-3 py-1.5 rounded text-11 font-semibold border transition-colors ${
                mode === m ? "bg-brand text-white border-brand" : "bg-bg-2 text-ink-2 border-hair-2 hover:text-ink-0"
              }`}
            >
              {m === "domain" ? "Domain harvest" : "Username search"}
            </button>
          ))}
        </div>
        <p className="text-11 text-ink-3 mb-3">{MODE_HINT[mode]}</p>
        <div className="flex gap-3">
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && run()}
            placeholder={mode === "domain" ? "acme.ae" : "john.smith"}
            className={inputCls}
          />
          <button
            type="button"
            onClick={run}
            disabled={loading || !target.trim()}
            className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Scanning…" : "Scan"}
          </button>
        </div>
        {error && <p className="mt-3 text-12 text-red">{error}</p>}
      </div>

      {hasResults && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 text-12 text-ink-2">
            <span className="font-semibold text-ink-0">{target}</span>
            {scannedAt && <span>scanned at {scannedAt}</span>}
          </div>

          {/* Domain harvest */}
          {domainResult && (
            <div className="grid grid-cols-3 gap-4">
              <ResultSection title="Email addresses" items={domainResult.emails} />
              <ResultSection title="Hosts / subdomains" items={domainResult.hosts} />
              <ResultSection title="IP addresses" items={domainResult.ips} />
            </div>
          )}

          {/* Sherlock */}
          {sherlockResult && sherlockResult.profiles.filter((p) => p.exists).length > 0 && (
            <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Sherlock — social profiles</div>
                <span className="font-mono text-11 text-brand">{sherlockResult.totalFound} found</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {sherlockResult.profiles.filter((p) => p.exists).map((p) => (
                  <a
                    key={p.site}
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between px-3 py-2 rounded bg-bg-2 hover:bg-bg-1 text-12 no-underline group"
                  >
                    <span className="text-ink-0 font-medium group-hover:text-brand">{p.site}</span>
                    <span className="text-11 text-ink-3 truncate max-w-[160px]">{p.url}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Social Analyzer */}
          {socialResult && socialResult.profiles.length > 0 && (
            <div className="bg-bg-panel border border-hair-2 rounded-xl p-5">
              <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2 mb-4">Social Analyzer</div>
              <div className="space-y-2">
                {socialResult.profiles.map((p) => (
                  <div key={p.platform} className="flex items-center gap-3 px-3 py-2 rounded bg-bg-2">
                    <span className="text-12 font-medium text-ink-0 w-32 shrink-0">{p.platform}</span>
                    <div className="flex-1 bg-hair rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.round(p.score * 100)}%` }} />
                    </div>
                    <span className="text-11 font-mono text-ink-2 w-10 text-right">{Math.round(p.score * 100)}%</span>
                    <a href={p.url} target="_blank" rel="noreferrer" className="text-11 text-brand hover:underline">view</a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sherlockResult && !sherlockResult.profiles.filter((p) => p.exists).length && !socialResult?.profiles.length && (
            <p className="text-13 text-ink-3">No profiles found for this username.</p>
          )}
        </div>
      )}
    </ModuleLayout>
  );
}

function ResultSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-11 font-semibold text-ink-1 uppercase tracking-wide-3">{title}</h3>
        <span className="text-11 font-mono text-brand">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-11 text-ink-3">None found</p>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, 50).map((item, i) => (
            <li key={i} className="text-11 font-mono text-ink-0 break-all bg-bg-2 px-2 py-0.5 rounded">{item}</li>
          ))}
          {items.length > 50 && <li className="text-11 text-ink-3">…and {items.length - 50} more</li>}
        </ul>
      )}
    </div>
  );
}
