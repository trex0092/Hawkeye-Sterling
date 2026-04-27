"use client";

import { useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

// Compliance Q&A — RAG pipeline over UAE / international AML regulatory corpus.
// Powered by /api/compliance-qa (complianceRag.ts integration).

interface Citation {
  document: string;
  section?: string;
  jurisdiction?: string;
  excerpt?: string;
}

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

const EXAMPLE_QUERIES = [
  "What are the CDD requirements for high-risk customers under FDL 20/2018?",
  "When must an STR be filed with the UAE FIU?",
  "What are the travel rule thresholds for virtual assets under CBUAE guidance?",
  "How long must KYC records be retained under UAE AML law?",
  "What defines a Politically Exposed Person under FATF recommendations?",
];

const TIER_TONE: Record<string, string> = {
  high:   "text-green",
  medium: "text-amber",
  low:    "text-red",
};

export default function ComplianceQaPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ComplianceAnswer | null>(null);
  const [error, setError] = useState("");

  const ask = async (q?: string) => {
    const text = (q ?? query).trim();
    if (!text) return;
    if (q) setQuery(q);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/compliance-qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: text, mode: "multi-agent" }),
      });
      const data = (await res.json()) as ComplianceAnswer;
      if (!data.ok) {
        setError(data.error ?? "Query failed");
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
    <ModuleLayout asanaModule="compliance-qa" asanaLabel="Compliance Q&A" engineLabel="Regulatory RAG engine">
      <ModuleHero
        eyebrow="Module · Regulatory Intelligence"
        title="Compliance"
        titleEm="Q&A."
        intro="Ask regulatory questions in plain language. Answers are grounded in UAE AML law, FATF recommendations, and Hawkeye Sterling's internal compliance corpus."
      />

      {/* Query box */}
      <div className="bg-bg-panel border border-hair-2 rounded-lg p-6 mb-6">
        <label className="block text-11 font-semibold uppercase tracking-wide text-ink-2 mb-2">
          Your compliance question
        </label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.ctrlKey && !loading && ask()}
          rows={3}
          placeholder="e.g. What are the CDD requirements for PEPs under UAE FDL 20/2018?"
          className="w-full bg-bg-input border border-hair-2 rounded px-3 py-2 text-13 text-ink-0 placeholder-ink-3 focus:outline-none focus:border-brand resize-none"
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-11 text-ink-3">Ctrl + Enter to submit</span>
          <button
            type="button"
            onClick={() => ask()}
            disabled={loading || !query.trim()}
            className="px-5 py-2 rounded bg-brand text-white text-12 font-semibold hover:bg-brand-deep disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Researching…" : "Ask"}
          </button>
        </div>
        {error && <p className="mt-3 text-12 text-red">{error}</p>}
      </div>

      {/* Example queries */}
      {!result && !loading && (
        <div className="mb-8">
          <p className="text-11 font-semibold uppercase tracking-wide text-ink-3 mb-3">Example questions</p>
          <div className="flex flex-col gap-2">
            {EXAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
                className="text-left text-12 text-brand hover:underline"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Answer */}
      {result && (
        <div className="space-y-5">
          {/* Quality gate banner */}
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-12 font-medium ${
            result.passedQualityGate
              ? "bg-green-dim border-green/30 text-green"
              : "bg-amber-dim border-amber/30 text-amber"
          }`}>
            <span>{result.passedQualityGate ? "✓" : "⚠"}</span>
            <span>
              {result.passedQualityGate ? "Quality gate passed" : "Quality gate not met — review with caution"}
            </span>
            {result.jurisdiction && (
              <span className="ml-auto font-mono text-11 opacity-70">{result.jurisdiction}</span>
            )}
          </div>

          {/* Confidence + consistency */}
          {(result.confidenceScore !== undefined || result.consistencyScore !== undefined) && (
            <div className="flex gap-6">
              {result.confidenceScore !== undefined && (
                <div>
                  <p className="text-10 font-semibold uppercase tracking-wide text-ink-3 mb-1">Confidence</p>
                  <p className={`text-20 font-mono font-semibold ${TIER_TONE[result.confidenceTier ?? "medium"] ?? "text-ink-0"}`}>
                    {Math.round(result.confidenceScore * 100)}%
                    <span className="text-11 text-ink-3 ml-1 font-sans">
                      {result.confidenceTier}
                    </span>
                  </p>
                </div>
              )}
              {result.consistencyScore !== undefined && (
                <div>
                  <p className="text-10 font-semibold uppercase tracking-wide text-ink-3 mb-1">Consistency</p>
                  <p className="text-20 font-mono font-semibold text-ink-0">
                    {Math.round(result.consistencyScore * 100)}%
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Answer text */}
          {result.answer && (
            <div className="bg-bg-panel border border-hair-2 rounded-lg p-5">
              <h3 className="text-11 font-semibold uppercase tracking-wide text-ink-3 mb-3">Answer</h3>
              <p className="text-14 text-ink-0 leading-[1.7] whitespace-pre-wrap">{result.answer}</p>
            </div>
          )}

          {/* Citations */}
          {result.citations.length > 0 && (
            <div>
              <h3 className="text-11 font-semibold uppercase tracking-wide text-ink-3 mb-3">
                Sources · {result.citations.length}
              </h3>
              <div className="space-y-2">
                {result.citations.map((c, i) => (
                  <div
                    key={i}
                    className="bg-bg-panel border border-hair-2 rounded px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <span className="text-12 font-semibold text-ink-0">{c.document}</span>
                      <div className="flex gap-2 shrink-0">
                        {c.section && (
                          <span className="text-10 font-mono text-ink-3 bg-bg-2 px-1.5 py-0.5 rounded">
                            {c.section}
                          </span>
                        )}
                        {c.jurisdiction && (
                          <span className="text-10 font-mono text-brand bg-brand-dim px-1.5 py-0.5 rounded">
                            {c.jurisdiction}
                          </span>
                        )}
                      </div>
                    </div>
                    {c.excerpt && (
                      <p className="text-11 text-ink-2 leading-relaxed border-l-2 border-hair pl-2.5">
                        {c.excerpt}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </ModuleLayout>
  );
}
