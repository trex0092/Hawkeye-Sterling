"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";

interface Citation { document: string; section?: string; jurisdiction?: string; excerpt?: string }
interface ComplianceAnswer {
  ok: boolean;
  query: string;
  answer?: string;
  citations: Citation[];
  confidenceScore?: number;
  confidenceTier?: string;
  consistencyScore?: number;
  jurisdiction?: string;
  passedQualityGate: boolean;
  error?: string;
}

const SUGGESTED = [
  "What is the EDD threshold for PEPs under EU 5AMLD?",
  "What records must a reporting institution maintain under the UAE AML Law?",
  "When is a Suspicious Activity Report required under the Bank Secrecy Act?",
  "What are the FATF criteria for high-risk jurisdictions?",
  "What constitutes shell company risk under FATF Recommendation 24?",
];

function ConfidenceMeter({ score }: { score: number }) {
  const colour = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">Confidence</span>
        <span className="font-medium">{score}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function ComplianceQaPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ComplianceAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(q?: string) {
    const question = (q ?? query).trim();
    if (!question) return;
    setQuery(question);
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/compliance-qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: question, mode: "multi-agent" }),
      });
      const data = await res.json() as ComplianceAnswer;
      if (!data.ok) setError(data.error ?? "Query failed");
      else setResult(data);
    } catch { setError("Request failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Regulatory Q&A</h1>
          <p className="text-sm text-gray-500 mt-1">
            Source-cited regulatory answers via AML-MultiAgent-RAG — 4-agent pipeline with confidence and consistency quality gates.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
          <textarea
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none"
            rows={3}
            placeholder="Ask a regulatory question…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) ask(); }}
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-gray-400">⌘+Enter to submit</span>
            <button onClick={() => ask()} disabled={loading || query.trim().length < 10} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-blue-700">
              {loading ? "Asking…" : "Ask"}
            </button>
          </div>
        </div>

        {/* Suggested questions */}
        {!result && !loading && (
          <div className="mb-6">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Suggested questions</p>
            <div className="space-y-1">
              {SUGGESTED.map((s) => (
                <button key={s} onClick={() => ask(s)} className="w-full text-left text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-2 rounded transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm mb-4">
            {error}
            {error.includes("COMPLIANCE_RAG_URL") || error.includes("503") ? (
              <p className="text-xs mt-1 text-red-500">Set COMPLIANCE_RAG_URL to a running AML-MultiAgent-RAG instance.</p>
            ) : null}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Quality gate */}
            <div className={`rounded-lg border p-3 text-sm flex items-center gap-2 ${result.passedQualityGate ? "bg-green-50 border-green-200 text-green-800" : "bg-yellow-50 border-yellow-200 text-yellow-800"}`}>
              <span>{result.passedQualityGate ? "✓" : "⚠"}</span>
              <span className="font-medium">{result.passedQualityGate ? "Passed quality gate" : "Below quality threshold — treat with caution"}</span>
              {result.consistencyScore != null && <span className="ml-auto text-xs">Consistency: {(result.consistencyScore * 100).toFixed(0)}%</span>}
            </div>

            {/* Answer */}
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <h2 className="text-sm font-semibold text-gray-700">Answer</h2>
                {result.jurisdiction && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{result.jurisdiction}</span>}
              </div>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{result.answer}</p>
              {result.confidenceScore != null && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <ConfidenceMeter score={result.confidenceScore} />
                </div>
              )}
            </div>

            {/* Citations */}
            {result.citations.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Regulatory Sources ({result.citations.length})</h3>
                <div className="space-y-3">
                  {result.citations.map((c, i) => (
                    <div key={i} className="border-l-2 border-blue-300 pl-3">
                      <p className="text-sm font-medium text-gray-800">{c.document}</p>
                      {c.section && <p className="text-xs text-gray-500 mt-0.5">§ {c.section}</p>}
                      {c.jurisdiction && <span className="text-xs text-blue-600">{c.jurisdiction}</span>}
                      {c.excerpt && <p className="text-xs text-gray-600 mt-1 italic">"{c.excerpt}"</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
