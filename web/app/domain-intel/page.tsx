"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";

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

function RiskBadge({ score }: { score: number }) {
  const cls = score >= 70 ? "bg-red-100 text-red-800 border-red-300"
    : score >= 40 ? "bg-orange-100 text-orange-700 border-orange-300"
    : score >= 20 ? "bg-yellow-100 text-yellow-700 border-yellow-300"
    : "bg-green-100 text-green-700 border-green-300";
  const label = score >= 70 ? "HIGH RISK" : score >= 40 ? "MEDIUM" : score >= 20 ? "LOW" : "CLEAR";
  return <span className={`border rounded px-2 py-0.5 text-xs font-bold ${cls}`}>{label} ({score})</span>;
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold ${ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
        {ok ? "✓" : "✗"}
      </span>
      <span className={ok ? "text-gray-700" : "text-red-700"}>{label}</span>
    </div>
  );
}

export default function DomainIntelPage() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DomainIntelResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      if (!data.ok) setError(data.error ?? "Scan failed");
      else setResult(data);
    } catch { setError("Request failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Domain Intelligence</h1>
          <p className="text-sm text-gray-500 mt-1">AML risk scoring via WHOIS age, malware flags, email security, SSL, and domain rank.</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6 flex gap-3">
          <input
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="domain.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && scan()}
          />
          <button onClick={scan} disabled={loading || !domain.trim()} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-blue-700">
            {loading ? "Scanning…" : "Scan Domain"}
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm mb-4">{error}</div>}

        {result && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">{result.domain}</h2>
                <RiskBadge score={result.riskScore} />
              </div>
              {result.riskFactors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Risk Factors</p>
                  {result.riskFactors.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-red-700">
                      <span className="mt-0.5">⚠</span><span>{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {result.whois && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">WHOIS</h3>
                  <div className="space-y-1 text-sm">
                    <div><span className="text-gray-400">Age</span> <span className="font-medium">{result.whois.ageInDays != null ? `${result.whois.ageInDays} days` : "—"}</span></div>
                    <div><span className="text-gray-400">Registered</span> <span className="font-medium">{result.whois.registrationDate?.slice(0, 10) ?? "—"}</span></div>
                    <div><span className="text-gray-400">Expires</span> <span className="font-medium">{result.whois.expiryDate?.slice(0, 10) ?? "—"}</span></div>
                    <div><span className="text-gray-400">Registrar</span> <span className="font-medium">{result.whois.registrar ?? "—"}</span></div>
                  </div>
                </div>
              )}

              {result.emailSecurity && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Email Security</h3>
                  <div className="space-y-2">
                    <Check ok={result.emailSecurity.hasSPF} label="SPF record" />
                    <Check ok={result.emailSecurity.hasDKIM} label="DKIM record" />
                    <Check ok={result.emailSecurity.hasDMARC} label="DMARC record" />
                    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                      Spoofing risk: <span className={`font-medium ${result.emailSecurity.spoofingRisk === "high" ? "text-red-700" : result.emailSecurity.spoofingRisk === "medium" ? "text-orange-600" : "text-green-700"}`}>{result.emailSecurity.spoofingRisk.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              )}

              {result.malware && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Malware / Phishing</h3>
                  <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${result.malware.flagged ? "bg-red-100" : "bg-green-100"}`}>
                      {result.malware.flagged ? "🚨" : "✓"}
                    </span>
                    <span className={`text-sm font-medium ${result.malware.flagged ? "text-red-700" : "text-green-700"}`}>
                      {result.malware.flagged ? `Flagged by ${result.malware.sources.join(", ")}` : "Clean"}
                    </span>
                  </div>
                </div>
              )}

              {result.ssl && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">SSL Certificate</h3>
                  <div className="space-y-2">
                    <Check ok={result.ssl.valid} label="Valid certificate" />
                    <Check ok={!result.ssl.selfSigned} label="Not self-signed" />
                    {result.ssl.issuer && <div className="text-xs text-gray-500">Issuer: {result.ssl.issuer}</div>}
                    {result.ssl.expiresAt && <div className="text-xs text-gray-500">Expires: {result.ssl.expiresAt.slice(0, 10)}</div>}
                  </div>
                </div>
              )}
            </div>

            {result.domainRank != null && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 text-sm">
                <span className="text-gray-500">Tranco Rank: </span>
                <span className="font-medium">{result.domainRank.toLocaleString()}</span>
                <span className="text-xs text-gray-400 ml-2">(1 = most popular)</span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
