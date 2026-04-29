// Hawkeye Sterling — AML-MultiAgent-RAG compliance Q&A client.
// luuisotorres/AML-MultiAgent-RAG is a 4-agent RAG system (RAG Agent +
// Confidence Agent + Consistency Agent + Orchestrator) backed by GPT-4o +
// Qdrant. This client wraps its FastAPI REST API for regulatory Q&A with
// source citations and confidence/consistency quality gates.
//
// Env vars:
//   COMPLIANCE_RAG_URL — base URL of the running AML-RAG instance (required)

import { fetchJsonWithRetry } from './httpRetry.js';

declare const process: { env?: Record<string, string | undefined> } | undefined;

export interface ComplianceQuestion {
  query: string;
  /** Route through the full 4-agent pipeline (higher quality) or single RAG agent (faster). */
  mode?: 'multi-agent' | 'single';
}

export interface ComplianceCitation {
  document: string;
  section?: string;
  jurisdiction?: string;
  excerpt?: string;
}

export interface ComplianceAnswer {
  ok: boolean;
  query: string;
  answer?: string;
  citations: ComplianceCitation[];
  confidenceScore?: number;     // 0–100 from Confidence Agent
  confidenceTier?: 'high' | 'medium' | 'low';
  consistencyScore?: number;    // 0–1 from Consistency Agent
  jurisdiction?: string;
  passedQualityGate: boolean;   // consistency >= 0.6 AND confidence >= 0.4
  error?: string;
}

interface RagApiResponse {
  answer?: string;
  citations?: Array<{
    document?: string;
    section?: string;
    jurisdiction?: string;
    excerpt?: string;
  }>;
  confidence_score?: number;
  confidence_tier?: string;
  consistency_score?: number;
  jurisdiction?: string;
  quality_gate_passed?: boolean;
  error?: string;
}

export async function askComplianceQuestion(
  question: ComplianceQuestion,
  options: { endpoint?: string; timeoutMs?: number } = {},
): Promise<ComplianceAnswer> {
  const baseUrl = options.endpoint
    ?? (typeof process !== 'undefined' ? process.env?.COMPLIANCE_RAG_URL : undefined);

  if (!baseUrl) {
    return {
      ok: false, query: question.query, citations: [], passedQualityGate: false,
      error: 'COMPLIANCE_RAG_URL not configured',
    };
  }

  const mode = question.mode ?? 'multi-agent';
  const path = mode === 'multi-agent' ? '/api/v1/multi-agent/query' : '/api/v1/query';
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;

  const result = await fetchJsonWithRetry<RagApiResponse>(
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query: question.query }),
    },
    { perAttemptMs: options.timeoutMs ?? 30_000, maxAttempts: 2 },
  );

  if (!result.ok || !result.json) {
    return {
      ok: false, query: question.query, citations: [], passedQualityGate: false,
      error: result.error ?? `RAG API HTTP ${result.status ?? 'unknown'}`,
    };
  }

  const data = result.json;
  const confidenceScore = typeof data.confidence_score === 'number'
    ? Math.round(data.confidence_score * (data.confidence_score > 1 ? 1 : 100))
    : undefined;
  const consistencyScore = data.consistency_score;

  // Quality gates from the Consistency + Confidence agents:
  // consistency >= 0.6 AND confidence (0–100) >= 40
  const passedQualityGate = data.quality_gate_passed === true
    || ((consistencyScore ?? 0) >= 0.6 && (confidenceScore ?? 0) >= 40);

  const citations: ComplianceCitation[] = (data.citations ?? []).map((c) => ({
    document: c.document ?? '',
    ...(c.section !== undefined ? { section: c.section } : {}),
    ...(c.jurisdiction !== undefined ? { jurisdiction: c.jurisdiction } : {}),
    ...(c.excerpt !== undefined ? { excerpt: c.excerpt } : {}),
  }));

  const tier = data.confidence_tier?.toLowerCase();
  const confidenceTier: 'high' | 'medium' | 'low' =
    tier === 'high' ? 'high' : tier === 'medium' ? 'medium' : 'low';

  return {
    ok: true,
    query: question.query,
    ...(data.answer !== undefined ? { answer: data.answer } : {}),
    citations,
    ...(confidenceScore !== undefined ? { confidenceScore } : {}),
    confidenceTier,
    ...(consistencyScore !== undefined ? { consistencyScore } : {}),
    ...(data.jurisdiction !== undefined ? { jurisdiction: data.jurisdiction } : {}),
    passedQualityGate,
  };
}

// Convenience: ask a regulatory question and only accept the answer if it
// passes the quality gate. Returns null if the answer is below threshold.
export async function askRegulation(
  query: string,
  endpoint?: string,
): Promise<ComplianceAnswer | null> {
  const answer = await askComplianceQuestion({ query, mode: 'multi-agent' }, endpoint !== undefined ? { endpoint } : {});
  if (!answer.ok || !answer.passedQualityGate) return null;
  return answer;
}
