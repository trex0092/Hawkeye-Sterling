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
    'You are the Hawkeye Sterling V2 data analyst agent. ' +
    'You receive one CaseReport JSON and zero or more CSV/JSON data files embedded in the user message. ' +
    'Produce a single self-contained HTML report with interactive charts embedded as SVG or inline Plotly. ' +
    'Cite every claim to a source in the CaseReport. Preserve the World-Check-style section ordering (Case/Comparison, Key Data, Keywords, SIC, PEP Sub-Category, Biography, PEP Roles, Connections, Sources, Audit, Notes).';
  const styles: Record<NonNullable<NarrativeReportRequest['style']>, string> = {
    regulator: 'Write for a UAE FIU / MoE regulator: formal, citation-dense, no hedging without evidence.',
    executive: 'Write for a board audience: top-line verdict, risk posture, three key findings, one-page TL;DR.',
    investigator: 'Write for an MLRO investigator: timeline, entity graph, reasoning chain, next-step recommendations.',
  };
  // The canonical compliance charter ALWAYS leads. Role and audience follow.
  return `${SYSTEM_PROMPT}\n\n================================================================================\nTASK ROLE\n================================================================================\n\n${role}\n\nAudience: ${styles[style]}`;
}

// Build the complete file block that goes into the user message.
// The Anthropic Messages API has no file-attachment mechanism — data must be
// embedded in the message body. Every file is delimited so the model can
// parse boundaries unambiguously.
function buildFileBlock(req: NarrativeReportRequest): string {
  const caseId = req.caseReport.identity.caseId;
  const files: Array<{ filename: string; mimeType: string; content: string }> = [
    {
      filename: `${caseId}.json`,
      mimeType: 'application/json',
      content: JSON.stringify(req.caseReport, null, 2),
    },
    ...(req.sourceData ?? []),
  ];

  return files
    .map((f) => `== ${f.filename} (${f.mimeType}) ==\n${f.content}`)
    .join('\n\n');
}

export function buildNarrativeRequest(req: NarrativeReportRequest): {
  system: string;
  messages: Array<{ role: 'user'; content: string }>;
  files: NarrativeReportRequest['sourceData'];
} {
  const fileBlock = buildFileBlock(req);
  const instruction =
    'Produce the narrative HTML report now. Use the CaseReport JSON above as ground truth. ' +
    'Render at least one chart per applicable section (match verdict breakdown, PEP role timeline, adverse-media category distribution, sources over time). ' +
    'Return only the final HTML.';

  return {
    system: systemPromptFor(req.style),
    messages: [
      {
        role: 'user',
        content: `DATA FILES:\n\n${fileBlock}\n\n---\n\n${instruction}`,
      },
    ],
    // Retained for API back-compat; the content is now embedded in messages above.
    files: req.sourceData,
  };
}

export async function generateNarrativeReport(
  req: NarrativeReportRequest,
  config: ClaudeAgentConfig,
  _fetchImpl: typeof fetch = fetch,
): Promise<NarrativeReportResult> {
  void _fetchImpl; // retained for API back-compat; resilient helper uses global fetch
  const payload = buildNarrativeRequest(req);

  const messages = payload.messages.filter((m) => m.content.trim());
  if (messages.length === 0) {
    return { ok: false, error: 'message content must be non-empty' };
  }

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
        messages,
        metadata: {
          product: 'hawkeye-sterling',
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
    let errorDetail = result.error ?? `HTTP ${result.status ?? 'unknown'}`;
    if (result.body && !result.partial) {
      try {
        const parsed = JSON.parse(result.body) as { error?: { message?: string } };
        if (parsed?.error?.message) errorDetail = `API Error: ${result.status} ${parsed.error.message}`;
      } catch { /* keep default error detail */ }
    }
    return {
      ok: false,
      error: `${prefix}${errorDetail} after ${result.attempts} attempt(s) in ${result.elapsedMs}ms`,
    };
  }
  const html = result.json.content?.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n') ?? '';
  return { ok: true, html };
}
