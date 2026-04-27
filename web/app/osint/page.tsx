"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";

interface EnrichResult {
  ok: boolean;
  subject: string;
  gleif?: {
    ok: boolean;
    lei: string;
    record?: { legalName: string; jurisdiction: string; registrationStatus: string };
    ownershipChain: Array<{ lei: string; legalName: string; jurisdiction: string; depth: number; relationshipType?: string }>;
  } | null;
  domainIntel?: {
    ok: boolean;
    domain: string;
    riskScore: number;
    riskFactors: string[];
    malware?: { flagged: boolean };
    emailSecurity?: { hasSPF: boolean; hasDKIM: boolean; hasDMARC: boolean; spoofingRisk: string };
  } | null;
  yente?: {
    score: number;
    caption: string;
    datasets: string[];
    schema: string;
  } | null;
  osint?: {
    ok: boolean;
    status: string;
    summary: {
      totalFindings: number;
      emailAddresses: string[];
      socialProfiles: string[];
      breachData: string[];
      riskIndicators: string[];
    };
  } | null;
  adverseMedia?: {
    totalCount: number;
    adverseCount: number;
    highRelevanceCount: number;
    items: Array<{ id: string; title: string; source: string; published: string; url?: string; tags: string[] }>;
    verdict?: {
      riskTier: string;
      riskDetail: string;
      sarRecommended: boolean;
      criticalCount: number;
      highCount: number;
      mediumCount: number;
      investigationLines: string[];
      fatfRecommendations: string[];
    };
  } | null;
  harvesterResult?: {
    emails: string[];
    hosts: string[];
    ips: string[];
  } | null;
  enrichedAt: string;
  error?: string;
}

export default function OsintPage() {
  const [name, setName] = useState("");
  const [lei, setLei] = useState("");
  const [domain, setDomain] = useState("");
  const [enableOsint, setEnableOsint] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EnrichResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enrich() {
    if (!name.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(lei.trim() ? { lei: lei.trim().toUpperCase() } : {}),
          ...(domain.trim() ? { domain: domain.trim().toLowerCase() } : {}),
          enableOsint,
        }),
      });
      const data = await res.json() as EnrichResult;
      if (!data.ok) setError(data.error ?? "Enrichment failed");
      else setResult(data);
    } catch { setError("Request failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Subject Enrichment / OSINT</h1>
          <p className="text-sm text-gray-500 mt-1">
            GLEIF LEI chain · yente sanctions match · Domain intel · Taranis AI adverse media · theHarvester · SpiderFoot — all in parallel.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Subject Name *</label>
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Emirates NBD PJSC" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">LEI (optional)</label>
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono" placeholder="20-char LEI" value={lei} onChange={(e) => setLei(e.target.value)} maxLength={20} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Domain (optional)</label>
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={enableOsint} onChange={(e) => setEnableOsint(e.target.checked)} className="rounded" />
              Enable SpiderFoot OSINT scan (passive, ~90s)
            </label>
            <button onClick={enrich} disabled={loading || !name.trim()} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-blue-700">
              {loading ? "Enriching…" : "Enrich Subject"}
            </button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm mb-4">{error}</div>}

        {result && (
          <div className="space-y-4">
            {/* yente */}
            {result.yente && (
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Sanctions / PEP Match (yente)</h3>
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold ${result.yente.score >= 0.8 ? "bg-red-100 text-red-700" : result.yente.score >= 0.5 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                    {Math.round(result.yente.score * 100)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{result.yente.caption}</p>
                    <p className="text-xs text-gray-500">{result.yente.schema} · Datasets: {result.yente.datasets.join(", ")}</p>
                  </div>
                </div>
              </div>
            )}

            {/* GLEIF */}
            {result.gleif?.ok && result.gleif.ownershipChain.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Beneficial Ownership Chain (GLEIF)</h3>
                <div className="space-y-2">
                  {result.gleif.ownershipChain.map((node) => (
                    <div key={node.lei} className="flex items-center gap-3 text-sm">
                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">{node.depth}</div>
                      <span className="font-medium">{node.legalName}</span>
                      <span className="text-gray-400 text-xs">{node.jurisdiction}</span>
                      {node.relationshipType === "ultimate" && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">UBO</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Domain intel */}
            {result.domainIntel?.ok && (
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Domain Intelligence ({result.domainIntel.domain})</h3>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`text-sm font-bold px-3 py-1 rounded ${result.domainIntel.riskScore >= 70 ? "bg-red-100 text-red-700" : result.domainIntel.riskScore >= 40 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                    Risk: {result.domainIntel.riskScore}/100
                  </div>
                  {result.domainIntel.malware?.flagged && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">MALWARE FLAGGED</span>}
                  {result.domainIntel.emailSecurity && (
                    <span className={`text-xs px-2 py-0.5 rounded ${result.domainIntel.emailSecurity.spoofingRisk === "high" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                      Spoofing: {result.domainIntel.emailSecurity.spoofingRisk.toUpperCase()}
                    </span>
                  )}
                </div>
                {result.domainIntel.riskFactors.length > 0 && (
                  <ul className="space-y-1">
                    {result.domainIntel.riskFactors.map((f, i) => <li key={i} className="text-xs text-red-600 flex gap-1"><span>⚠</span>{f}</li>)}
                  </ul>
                )}
              </div>
            )}

            {/* Adverse Media */}
            {result.adverseMedia && (
              <div className={`bg-white rounded-lg border-2 p-5 ${result.adverseMedia.verdict?.riskTier === "critical" ? "border-red-600" : result.adverseMedia.verdict?.riskTier === "high" ? "border-red-300" : result.adverseMedia.verdict?.riskTier === "medium" ? "border-orange-300" : "border-gray-200"}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase">Adverse Media (Taranis AI)</h3>
                  {result.adverseMedia.verdict && (
                    <span className={`text-xs font-bold px-2.5 py-1 rounded uppercase ${result.adverseMedia.verdict.riskTier === "critical" ? "bg-red-700 text-white" : result.adverseMedia.verdict.riskTier === "high" ? "bg-red-100 text-red-800 border border-red-300" : result.adverseMedia.verdict.riskTier === "medium" ? "bg-orange-100 text-orange-800 border border-orange-300" : result.adverseMedia.verdict.riskTier === "low" ? "bg-yellow-100 text-yellow-800 border border-yellow-300" : "bg-green-100 text-green-800 border border-green-300"}`}>
                      {result.adverseMedia.verdict.riskTier}
                    </span>
                  )}
                </div>
                <div className="flex gap-4 text-sm mb-3">
                  <span><span className="text-gray-400">Total: </span><span className="font-medium">{result.adverseMedia.totalCount}</span></span>
                  <span><span className="text-gray-400">Adverse: </span><span className={`font-medium ${result.adverseMedia.adverseCount > 0 ? "text-red-600" : "text-green-600"}`}>{result.adverseMedia.adverseCount}</span></span>
                  <span><span className="text-gray-400">High relevance: </span><span className="font-medium">{result.adverseMedia.highRelevanceCount}</span></span>
                </div>
                {result.adverseMedia.verdict?.sarRecommended && (
                  <div className="bg-red-700 text-white text-xs px-3 py-2 rounded mb-3 font-bold">
                    SAR RECOMMENDED — FATF R.20 reporting threshold met
                  </div>
                )}
                {result.adverseMedia.verdict?.fatfRecommendations && result.adverseMedia.verdict.fatfRecommendations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {result.adverseMedia.verdict.fatfRecommendations.map((r) => (
                      <span key={r} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-mono">{r}</span>
                    ))}
                  </div>
                )}
                {result.adverseMedia.verdict?.investigationLines && result.adverseMedia.verdict.investigationLines.length > 0 && (
                  <ul className="space-y-1">
                    {result.adverseMedia.verdict.investigationLines.slice(0, 3).map((l, i) => (
                      <li key={i} className="text-xs text-gray-600 flex gap-1.5"><span className="text-gray-300 flex-shrink-0">{i + 1}.</span>{l}</li>
                    ))}
                  </ul>
                )}
                {result.adverseMedia.verdict?.riskDetail && (
                  <p className="text-xs text-gray-400 mt-2">{result.adverseMedia.verdict.riskDetail}</p>
                )}
              </div>
            )}

            {/* theHarvester results */}
            {result.harvesterResult && (result.harvesterResult.emails.length > 0 || result.harvesterResult.hosts.length > 0 || result.harvesterResult.ips.length > 0) && (
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">theHarvester — Email / Host / IP Enumeration</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400 text-xs mb-1.5">Emails ({result.harvesterResult.emails.length})</p>
                    {result.harvesterResult.emails.slice(0, 8).map((e) => (
                      <p key={e} className="font-mono text-xs text-gray-700 truncate">{e}</p>
                    ))}
                    {result.harvesterResult.emails.length > 8 && <p className="text-xs text-gray-400">+{result.harvesterResult.emails.length - 8} more</p>}
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-1.5">Hosts ({result.harvesterResult.hosts.length})</p>
                    {result.harvesterResult.hosts.slice(0, 8).map((h) => (
                      <p key={h} className="font-mono text-xs text-gray-700 truncate">{h}</p>
                    ))}
                    {result.harvesterResult.hosts.length > 8 && <p className="text-xs text-gray-400">+{result.harvesterResult.hosts.length - 8} more</p>}
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-1.5">IPs ({result.harvesterResult.ips.length})</p>
                    {result.harvesterResult.ips.slice(0, 8).map((ip) => (
                      <p key={ip} className="font-mono text-xs text-gray-700">{ip}</p>
                    ))}
                    {result.harvesterResult.ips.length > 8 && <p className="text-xs text-gray-400">+{result.harvesterResult.ips.length - 8} more</p>}
                  </div>
                </div>
              </div>
            )}

            {/* SpiderFoot OSINT */}
            {result.osint && (
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">OSINT Scan (SpiderFoot) — {result.osint.status}</h3>
                {result.osint.ok ? (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400 text-xs mb-1">Email Addresses ({result.osint.summary.emailAddresses.length})</p>
                      {result.osint.summary.emailAddresses.slice(0, 5).map((e) => <p key={e} className="font-mono text-xs text-gray-700">{e}</p>)}
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs mb-1">Social Profiles ({result.osint.summary.socialProfiles.length})</p>
                      {result.osint.summary.socialProfiles.slice(0, 5).map((s) => <p key={s} className="text-xs text-gray-700 truncate">{s}</p>)}
                    </div>
                    {result.osint.summary.riskIndicators.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-gray-400 text-xs mb-1">Risk Indicators ({result.osint.summary.riskIndicators.length})</p>
                        {result.osint.summary.riskIndicators.slice(0, 5).map((r) => <p key={r} className="text-xs text-red-600">{r}</p>)}
                      </div>
                    )}
                    {result.osint.summary.breachData.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-xs font-medium text-red-600">{result.osint.summary.breachData.length} breach record(s) found</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">SpiderFoot not configured (set SPIDERFOOT_URL) or scan failed.</p>
                )}
              </div>
            )}

            <p className="text-xs text-gray-400 text-right">Enriched at {new Date(result.enrichedAt).toLocaleString()}</p>
          </div>
        )}
      </main>
    </div>
  );
}
