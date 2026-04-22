import type { CaseReport } from '../reports/caseReport.js';
import { SYSTEM_PROMPT } from '../policy/systemPrompt.js';
import { fetchJsonWithRetry } from './httpRetry.js';

export interface ClaudeAgentConfig {
  apiKey: string;
  model: string;
  sandboxImage?: string;
  timeoutMs?: number;
  maxSteps?: number;
}

export interface NarrativeReportRequest {
  caseReport: CaseReport;
  sourceData?: Array<{
    filename: string;
    mimeType: 'text/csv' | 'application/json' | 'text/plain';
    content: string;
  }>;
  style?: 'regulator' | 'executive' | 'investigator';
}

export interface NarrativeReportResult {
  ok: boolean;
  html?: string;
  charts?: Array<{
    id: string;
    kind: 'bar' | 'line' | 'pie' | 'scatter' | 'heatmap' | 'timeline';
    title: string;
    dataUri: string;
  }>;
  transcript?: Array<{
    step: number;
    tool: string;
    summary: string;
  }>;
  error?: string;
}

const DEFAULT_MODEL = 'claude-opus-4-7';

function systemPromptFor(style: NarrativeReportRequest['style'] = 'regulator'): string {
  const role =
    'You are the Hawkeye Sterling V2 data analyst agent. You have access to a sandboxed Python environment with pandas, matplotlib/plotly and file mounting. ' +
    'You receive one CaseReport JSON and zero or more CSV/JSON data files. Produce a single self-contained HTML report with interactive charts embedded as SVG or inline Plotly. ' +
    'Cite every claim to a source in the CaseReport. Preserve the World-Check-style section ordering (Case/Comparison, Key Data, Keywords, SIC, PEP Sub-Category, Biography, PEP Roles, Connections, Sources, Audit, Notes).';
  const styles: Record<NonNullable<NarrativeReportRequest['style']>, string> = {
    regulator: 'Write for a UAE FIU / MoE regulator: formal, citation-dense, no hedging without evidence.',
    executive: 'Write for a board audience: top-line verdict, risk posture, three key findings, one-page TL;DR.',
    investigator: 'Write for an MLRO investigator: timeline, entity graph, reasoning chain, next-step recommendations.',
  };
  // The canonical compliance charter ALWAYS leads. Role and audience follow.
  return `${SYSTEM_PROMPT}\n\n================================================================================\nTASK ROLE\n================================================================================\n\n${role}\n\nAudience: ${styles[style]}`;
}

export function buildNarrativeRequest(req: NarrativeReportRequest): {
  system: string;
  messages: Array<{ role: 'user'; content: string }>;
  files: NarrativeReportRequest['sourceData'];
} {
  return {
    system: systemPromptFor(req.style),
    messages: [
      {
        role: 'user',
        content:
          'Produce the narrative HTML report now. Use the attached CaseReport JSON as ground truth. ' +
          'Render at least one chart per applicable section (match verdict breakdown, PEP role timeline, adverse-media category distribution, sources over time). ' +
          'Return only the final HTML.',
      },
    ],
    files: [
      {
        filename: `${req.caseReport.identity.caseId}.json`,
        mimeType: 'application/json',
        content: JSON.stringify(req.caseReport, null, 2),
      },
      ...(req.sourceData ?? []),
    ],
  };
}

export async function generateNarrativeReport(
  req: NarrativeReportRequest,
  config: ClaudeAgentConfig,
  _fetchImpl: typeof fetch = fetch,
): Promise<NarrativeReportResult> {
  void _fetchImpl; // retained for API back-compat; resilient helper uses global fetch
  const payload = buildNarrativeRequest(req);
  const result = await fetchJsonWithRetry<{ content?: Array<{ type: string; text?: string }> }>(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model || DEFAULT_MODEL,
        max_tokens: 16000,
        system: payload.system,
        messages: payload.messages,
        metadata: {
          product: 'hawkeye-sterling-v2',
          module: '01-subject-screening',
          kind: 'narrative-report',
        },
      }),
    },
    {
      perAttemptMs: config.timeoutMs ?? 60_000,
      idleReadMs: 25_000,
      maxAttempts: 3,
    },
  );

  if (!result.ok || !result.json) {
    const prefix = result.partial ? 'partial response (stream idle) ' : '';
    return {
      ok: false,
      error: `${prefix}${result.error ?? `HTTP ${result.status ?? 'unknown'}`} after ${result.attempts} attempt(s) in ${result.elapsedMs}ms`,
    };
  }
  const html = result.json.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n') ?? '';
  return { ok: true, html };
}
