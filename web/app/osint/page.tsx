"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

// OSINT — Open Source Intelligence gathering.
// Queries theHarvester (domain mode) or Sherlock + Social Analyzer (username mode)
// via the /api/osint-bridge endpoint.

interface HarvesterResult {
  ok: boolean;
  emails: string[];
  hosts: string[];
  ips: string[];
  error?: string;
}

interface SherlockProfile {
  site: string;
  url: string;
  exists: boolean;
}

interface SherlockResult {
  ok: boolean;
  username: string;
  profiles: SherlockProfile[];
  totalFound: number;
  error?: string;
}

interface SocialProfile {
  platform: string;
  url: string;
  score: number;
}

interface SocialResult {
  ok: boolean;
  person: string;
  profiles: SocialProfile[];
  error?: string;
}

interface OsintResult {
  ok: boolean;
  mode: "domain" | "username";
  target: string;
  result?: HarvesterResult;
  sherlock?: SherlockResult | null;
  social?: SocialResult | null;
  scannedAt?: string;
  error?: string;
}

type Mode = "domain" | "username";

const MODE_HINT: Record<Mode, string> = {
  domain:   "Enter a domain (e.g. acme.ae) to harvest emails, hosts and IP addresses",
  username: "Enter a username or person name to search social platforms",
};

export default function OsintPage() {
  const [mode, setMode] = useState<Mode>("domain");
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OsintResult | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    const t = target.trim();
    if (!t) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/osint-bridge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, target: t }),
      });
      const data = (await res.json()) as OsintResult;
      if (!data.ok) {
        setError(data.error ?? "OSINT scan failed");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error — check connectivity");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModuleLayout asanaModule="intel" asanaLabel="OSINT Intelligence">
      <ModuleHero
        eyebrow="Intelligence · Open Source"
        title="OSINT"
        titleEm="Intelligence."
        intro="Harvest open-source signals from public infrastructure, social platforms, and domain records."
      />

      {/* Query panel */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-6 mb-8">
        <div className="flex gap-3 mb-4">
          {(["domain", "username"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setResult(null); setError(""); }}
              className={`px-3 py-1.5 rounded text-11 font-semibold border transition-colors ${
                mode === m
                  ? "bg-brand text-white border-brand"
                  : "bg-bg-2 text-ink-2 border-hair-2 hover:text-ink-0"
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
            className="flex-1 bg-bg-input border border-hair-2 rounded px-3 py-2 text-13 text-ink-0 placeholder-ink-3 focus:outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={run}
            disabled={loading || !target.trim()}
            className="px-4 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand-deep disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Scanning…" : "Scan"}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-12 text-red">{error}</p>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="font-mono text-11 text-ink-3 uppercase tracking-wide">
              Results for
            </span>
            <span className="font-semibold text-14 text-ink-0">{result.target}</span>
            {result.scannedAt && (
              <span className="text-11 text-ink-3">
                {new Date(result.scannedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          {/* Domain harvest results */}
          {result.mode === "domain" && result.result && (
            <div className="grid grid-cols-3 gap-4">
              <ResultSection title="Email addresses" items={result.result.emails} />
              <ResultSection title="Hosts / subdomains" items={result.result.hosts} />
              <ResultSection title="IP addresses" items={result.result.ips} />
            </div>
          )}

          {/* Username / social results */}
          {result.mode === "username" && (
            <div className="space-y-4">
              {result.sherlock?.profiles && result.sherlock.profiles.length > 0 && (
                <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-13 font-semibold text-ink-0">Sherlock profile search</h3>
                    <span className="text-11 font-mono text-brand">
                      {result.sherlock.totalFound} found
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {result.sherlock.profiles.filter((p) => p.exists).map((p) => (
                      <a
                        key={p.site}
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between px-3 py-2 rounded bg-bg-2 hover:bg-bg-1 text-12 no-underline group"
                      >
                        <span className="text-ink-0 font-medium group-hover:text-brand">{p.site}</span>
                        <span className="text-11 text-ink-3 truncate max-w-[140px]">{p.url}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {result.social?.profiles && result.social.profiles.length > 0 && (
                <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
                  <h3 className="text-13 font-semibold text-ink-0 mb-4">Social Analyzer</h3>
                  <div className="space-y-2">
                    {result.social.profiles.map((p) => (
                      <div key={p.platform} className="flex items-center gap-3 px-3 py-2 rounded bg-bg-2">
                        <span className="text-12 font-medium text-ink-0 w-32 shrink-0">{p.platform}</span>
                        <div className="flex-1 bg-hair rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full bg-brand"
                            style={{ width: `${Math.round(p.score * 100)}%` }}
                          />
                        </div>
                        <span className="text-11 font-mono text-ink-2 w-10 text-right">
                          {Math.round(p.score * 100)}%
                        </span>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-11 text-brand hover:underline"
                        >
                          view
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!result.sherlock?.profiles?.length && !result.social?.profiles?.length && (
                <p className="text-13 text-ink-3">No profiles found for this username.</p>
              )}
            </div>
          )}
        </div>
      )}
    </ModuleLayout>
  );
}

function ResultSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-12 font-semibold text-ink-1 uppercase tracking-wide">{title}</h3>
        <span className="text-11 font-mono text-brand">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-11 text-ink-3">None found</p>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, 50).map((item, i) => (
            <li key={i} className="text-11 font-mono text-ink-0 break-all bg-bg-2 px-2 py-0.5 rounded">
              {item}
            </li>
          ))}
          {items.length > 50 && (
            <li className="text-11 text-ink-3">…and {items.length - 50} more</li>
          )}
        </ul>
      )}
    </div>
  );
}
