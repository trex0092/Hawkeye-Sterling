"use client";

import { useState, useEffect, useRef } from "react";
import { ModuleLayout, ModuleHero } from "@/components/layout/ModuleLayout";
import { AsanaReportButton } from "@/components/shared/AsanaReportButton";

interface DomainIntelResult {
  ok: boolean;
  domain: string;
  riskScore: number;
  riskFactors: string[];
  whois?: { registrationDate?: string; expiryDate?: string; registrar?: string; ageInDays?: number };
  malware?: { flagged: boolean; sources: string[] };
  emailSecurity?: { hasSPF: boolean; hasDKIM: boolean; hasDMARC: boolean; spoofingRisk: string };
  ssl?: { valid: boolean; issuer?: string; expiresAt?: string; selfSigned: boolean };
  domainRank?: number;
  error?: string;
}

function riskTone(score: number) {
  if (score >= 70) return { badge: "bg-red-dim text-red border border-red/30", label: "HIGH RISK" };
  if (score >= 40) return { badge: "bg-amber-dim text-amber border border-amber/30", label: "MEDIUM" };
  if (score >= 20) return { badge: "bg-amber-dim text-amber border border-amber/30", label: "LOW" };
  return { badge: "bg-green-dim text-green border border-green/30", label: "CLEAR" };
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-12">
      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-10 font-bold flex-shrink-0 ${ok ? "bg-green-dim text-green" : "bg-red-dim text-red"}`}>
        {ok ? "✓" : "✗"}
      </span>
      <span className={ok ? "text-ink-1" : "text-red"}>{label}</span>
    </div>
  );
}

const inputCls = "flex-1 px-3 py-2 border border-hair-2 rounded text-13 bg-bg-1 focus:outline-none focus:border-brand text-ink-0";
const btnCls = "px-4 py-1.5 rounded bg-brand text-white text-12 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity";
const cardCls = "border border-hair-2 rounded-lg p-4";

export default function DomainIntelPage() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DomainIntelResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  async function scan() {
    if (!domain.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/domain-intel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: domain.trim().toLowerCase() }),
      });
      const data = await res.json() as DomainIntelResult;
      if (!mountedRef.current) return;
      if (!data.ok) setError(data.error ?? "Scan failed");
      else setResult(data);
    } catch (err) {
      console.error("[hawkeye] domain-intel threw:", err);
      if (mountedRef.current) setError("Request failed");
    } finally { if (mountedRef.current) setLoading(false); }
  }

  return (
    <ModuleLayout asanaModule="domain-intel" asanaLabel="Domain Intel" engineLabel="Domain Intel">
      <ModuleHero

        eyebrow="Module · Counterparty Intelligence"
        title="Domain"
        titleEm="intelligence."
        intro="AML risk scoring via WHOIS age, malware flags, email security, SSL validity, and domain rank."
      />

      <div className="bg-bg-panel border border-hair-2 rounded-xl p-5 space-y-4">
        <div>
          <div className="text-11 font-semibold tracking-wide-4 uppercase text-brand mb-1">
            Counterparty Intelligence · Domain Scan
          </div>
          <div className="text-12 text-ink-2">
            WHOIS age · malware · email security · SSL · Tranco rank
          </div>
        </div>

        <div className="flex gap-3">
          <input
            className={inputCls}
            placeholder="domain.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && scan()}
          />
          <button type="button" onClick={scan} disabled={loading || !domain.trim()} className={btnCls}>
            {loading ? "Scanning…" : "Scan Domain"}
          </button>
        </div>

        {error && (
          <div className="bg-red-dim border border-red/30 rounded-lg p-3 text-12 text-red">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className={cardCls}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-14 font-semibold text-ink-0">{result.domain}</p>
                  <div className="mt-2">
                    <AsanaReportButton payload={{
                      module: "domain-intel",
                      label: result.domain,
                      summary: `Domain: ${result.domain}; Risk: ${result.riskScore}/100 (${riskTone(result.riskScore).label}); Factors: ${result.riskFactors.join("; ") || "none"}`,
                      metadata: { riskScore: result.riskScore, riskLevel: riskTone(result.riskScore).label, factors: result.riskFactors.length, spoofingRisk: result.emailSecurity?.spoofingRisk ?? "—" },
                    }} />
                  </div>
                </div>
                <span className={`text-11 font-bold px-2.5 py-1 rounded uppercase flex-shrink-0 ml-3 ${riskTone(result.riskScore).badge}`}>
                  {riskTone(result.riskScore).label} · {result.riskScore}/100
                </span>
              </div>
              {result.riskFactors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-10 font-semibold text-ink-2 uppercase tracking-wide-3 mb-2">Risk Factors</p>
                  {result.riskFactors.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-12 text-red">
                      <span className="mt-0.5 flex-shrink-0">⚠</span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.whois && (
                <div className={cardCls}>
                  <p className="text-10 font-semibold text-ink-2 uppercase tracking-wide-3 mb-3">WHOIS</p>
                  <div className="space-y-1.5 text-12">
                    <div className="flex justify-between">
                      <span className="text-ink-3">Age</span>
                      <span className="font-medium text-ink-0">{result.whois.ageInDays != null ? `${result.whois.ageInDays} days` : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-3">Registered</span>
                      <span className="font-medium text-ink-0">{result.whois.registrationDate?.slice(0, 10) ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-3">Expires</span>
                      <span className="font-medium text-ink-0">{result.whois.expiryDate?.slice(0, 10) ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-3">Registrar</span>
                      <span className="font-medium text-ink-0 truncate max-w-32">{result.whois.registrar ?? "—"}</span>
                    </div>
                  </div>
                </div>
              )}

              {result.emailSecurity && (
                <div className={cardCls}>
                  <p className="text-10 font-semibold text-ink-2 uppercase tracking-wide-3 mb-3">Email Security</p>
                  <div className="space-y-2">
                    <Check ok={result.emailSecurity.hasSPF} label="SPF record" />
                    <Check ok={result.emailSecurity.hasDKIM} label="DKIM record" />
                    <Check ok={result.emailSecurity.hasDMARC} label="DMARC record" />
                    <div className="mt-2 pt-2 border-t border-hair text-11 text-ink-3">
                      Spoofing risk:{" "}
                      <span className={`font-semibold ${result.emailSecurity.spoofingRisk === "high" ? "text-red" : result.emailSecurity.spoofingRisk === "medium" ? "text-amber" : "text-green"}`}>
                        {result.emailSecurity.spoofingRisk.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {result.malware && (
                <div className={cardCls}>
                  <p className="text-10 font-semibold text-ink-2 uppercase tracking-wide-3 mb-3">Malware / Phishing</p>
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-14 ${result.malware.flagged ? "bg-red-dim" : "bg-green-dim"}`}>
                      {result.malware.flagged ? "🚨" : "✓"}
                    </span>
                    <span className={`text-12 font-medium ${result.malware.flagged ? "text-red" : "text-green"}`}>
                      {result.malware.flagged ? `Flagged by ${result.malware.sources.join(", ")}` : "Clean"}
                    </span>
                  </div>
                </div>
              )}

              {result.ssl && (
                <div className={cardCls}>
                  <p className="text-10 font-semibold text-ink-2 uppercase tracking-wide-3 mb-3">SSL Certificate</p>
                  <div className="space-y-2">
                    <Check ok={result.ssl.valid} label="Valid certificate" />
                    <Check ok={!result.ssl.selfSigned} label="Not self-signed" />
                    {result.ssl.issuer && <div className="text-11 text-ink-3">Issuer: {result.ssl.issuer}</div>}
                    {result.ssl.expiresAt && <div className="text-11 text-ink-3">Expires: {result.ssl.expiresAt.slice(0, 10)}</div>}
                  </div>
                </div>
              )}
            </div>

            {result.domainRank != null && (
              <div className={cardCls}>
                <span className="text-12 text-ink-3">Tranco Rank: </span>
                <span className="text-12 font-medium text-ink-0">{result.domainRank.toLocaleString()}</span>
                <span className="text-11 text-ink-3 ml-2">(1 = most popular)</span>
              </div>
            )}
          </div>
        )}
      </div>
    </ModuleLayout>
  );
}
