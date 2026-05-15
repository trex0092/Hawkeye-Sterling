// Hawkeye Sterling — LSEG World-Check One MCP client.
//
// Connects to the WC1 MCP HTTP server at LSEG_WC1_MCP_URL
// (default: http://localhost:3001/mcp) using Streamable HTTP
// transport (MCP spec 2025-03-26).
//
// Tools are discovered at runtime via tools/list — no hard-coded
// assumptions about which specific names the server publishes. The
// module normalises results into CorporateRecord-compatible shapes so
// the caller can drop it directly into the commercial-adapter chain.
//
// Env vars:
//   LSEG_WC1_MCP_URL   — Full MCP endpoint URL. Default: http://localhost:3001/mcp
//   LSEG_WC1_TIMEOUT_MS — Per-request timeout ms. Default: 15000

import { fetchJsonWithRetry } from './httpRetry.js';

const DEFAULT_URL = 'http://localhost:3001/mcp';
const DEFAULT_TIMEOUT_MS = 15_000;

function mcpUrl(): string {
  return (process.env['LSEG_WC1_MCP_URL'] ?? DEFAULT_URL).replace(/\/$/, '') + '';
}

function timeoutMs(): number {
  const v = process.env['LSEG_WC1_TIMEOUT_MS'];
  return v ? Number(v) : DEFAULT_TIMEOUT_MS;
}

// ── JSON-RPC over Streamable HTTP ─────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id: number;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

let _idCounter = 1;

async function rpc<T>(method: string, params?: unknown): Promise<T> {
  const id = _idCounter++;
  const body: JsonRpcRequest = { jsonrpc: '2.0', method, id };
  if (params !== undefined) body.params = params;

  const result = await fetchJsonWithRetry<JsonRpcResponse<T>>(
    mcpUrl(),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
    },
    { perAttemptMs: timeoutMs(), maxAttempts: 2 },
  );

  if (!result.ok || result.json === null) {
    throw new Error(`WC1 MCP RPC failed (HTTP ${result.status}): ${result.error ?? result.body?.slice(0, 200)}`);
  }

  const resp = result.json;
  if (resp.error) {
    throw new Error(`WC1 MCP error [${resp.error.code}]: ${resp.error.message}`);
  }
  if (resp.result === undefined) {
    throw new Error(`WC1 MCP: no result in response for method=${method}`);
  }
  return resp.result;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Wc1ToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface Wc1ScreenHit {
  entityId?: string;
  name: string;
  entityType?: string;
  categories?: string[];
  countries?: string[];
  aliases?: string[];
  matchScore?: number;
  sources?: string[];
  lastUpdated?: string;
}

export interface Wc1ScreenResult {
  ok: true;
  tool: string;
  hits: Wc1ScreenHit[];
  raw?: unknown;
}

export type Wc1Result<T> =
  | T
  | { ok: false; error: string };

// ── Tool discovery ────────────────────────────────────────────────────────────

interface ToolsListResult {
  tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
}

let _toolsCache: Wc1ToolInfo[] | null = null;

export async function listTools(): Promise<Wc1ToolInfo[]> {
  if (_toolsCache) return _toolsCache;
  const resp = await rpc<ToolsListResult>('tools/list');
  _toolsCache = resp.tools ?? [];
  return _toolsCache;
}

function bestToolName(tools: Wc1ToolInfo[], ...candidates: string[]): string | undefined {
  for (const c of candidates) {
    if (tools.find((t) => t.name === c)) return c;
  }
  // Fuzzy fallback: first tool whose name includes a candidate keyword
  for (const c of candidates) {
    const kw = c.replace(/[_-]/g, '').toLowerCase();
    const found = tools.find((t) => t.name.replace(/[_-]/g, '').toLowerCase().includes(kw));
    if (found) return found.name;
  }
  return undefined;
}

// ── Health check ──────────────────────────────────────────────────────────────

export interface Wc1HealthResult {
  available: boolean;
  toolCount?: number;
  tools?: string[];
  error?: string;
  latencyMs?: number;
}

export async function checkHealth(): Promise<Wc1HealthResult> {
  const t0 = Date.now();
  try {
    const tools = await listTools();
    return {
      available: true,
      toolCount: tools.length,
      tools: tools.map((t) => t.name),
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - t0,
    };
  }
}

// ── Screen / search ───────────────────────────────────────────────────────────

interface ToolCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const resp = await rpc<ToolCallResult>('tools/call', { name, arguments: args });
  if (resp.isError) {
    const msg = resp.content.find((c) => c.type === 'text')?.text ?? 'tool error';
    throw new Error(`WC1 tool ${name} returned error: ${msg}`);
  }
  const textContent = resp.content.find((c) => c.type === 'text')?.text;
  if (!textContent) return resp;
  try { return JSON.parse(textContent); } catch { return textContent; }
}

// Screen a name against World-Check One. Tries the most common tool names
// in priority order; the first match wins.
export async function screenName(
  name: string,
  options: {
    entityType?: 'INDIVIDUAL' | 'ORGANISATION' | 'VESSEL' | 'AIRCRAFT';
    limit?: number;
  } = {},
): Promise<Wc1Result<Wc1ScreenResult>> {
  let tools: Wc1ToolInfo[];
  try {
    tools = await listTools();
  } catch (err) {
    return { ok: false, error: `tool discovery failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const toolName = bestToolName(
    tools,
    'wc1_screen', 'screen', 'search_cases', 'create_case',
    'wc1_search', 'search', 'screen_entity', 'lookup',
  );
  if (!toolName) {
    return { ok: false, error: `no screening tool found on WC1 MCP server (available: ${tools.map((t) => t.name).join(', ')})` };
  }

  try {
    const raw = await callTool(toolName, {
      name,
      ...(options.entityType ? { entityType: options.entityType } : {}),
      ...(options.limit ? { limit: options.limit } : {}),
    });
    const hits = normaliseHits(raw);
    return { ok: true, tool: toolName, hits, raw };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Result normalisation ──────────────────────────────────────────────────────

function normaliseHits(raw: unknown): Wc1ScreenHit[] {
  if (!raw || typeof raw !== 'object') return [];

  // Unwrap common envelope shapes
  const r = raw as Record<string, unknown>;
  const candidates = r['results'] ?? r['hits'] ?? r['matches'] ?? r['cases'] ?? r['data'] ?? raw;

  const arr = Array.isArray(candidates) ? candidates : [candidates];

  return arr
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const o = item as Record<string, unknown>;
      const name =
        typeof o['name'] === 'string' ? o['name'] :
        typeof o['primaryName'] === 'string' ? o['primaryName'] :
        typeof o['fullName'] === 'string' ? o['fullName'] :
        typeof o['caption'] === 'string' ? o['caption'] : '';
      if (!name) return null;

      const hit: Wc1ScreenHit = { name };

      const id = o['id'] ?? o['entityId'] ?? o['caseId'] ?? o['uid'] ?? o['worldCheckId'];
      if (typeof id === 'string') hit.entityId = id;

      const et = o['entityType'] ?? o['type'] ?? o['subjectType'];
      if (typeof et === 'string') hit.entityType = et;

      const score = o['matchScore'] ?? o['score'] ?? o['confidence'];
      if (typeof score === 'number') hit.matchScore = score;

      const cats = o['categories'] ?? o['riskCategories'] ?? o['topics'] ?? o['pepCategory'];
      hit.categories = takeStrArr(cats);

      const ctys = o['countries'] ?? o['country'] ?? o['nationality'] ?? o['nationalities'];
      hit.countries = takeStrArr(ctys);

      const aka = o['aliases'] ?? o['aka'] ?? o['alternateNames'] ?? o['alternativeNames'];
      hit.aliases = takeStrArr(aka);

      const src = o['sources'] ?? o['providers'] ?? o['lists'];
      hit.sources = takeStrArr(src);

      const lu = o['lastUpdated'] ?? o['updatedAt'] ?? o['modifiedAt'];
      if (typeof lu === 'string') hit.lastUpdated = lu;

      return hit;
    })
    .filter((h): h is Wc1ScreenHit => h !== null);
}

function takeStrArr(v: unknown, max = 16): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, max);
  }
  if (typeof v === 'string' && v.length > 0) return [v];
  return [];
}

// ── isAvailable ───────────────────────────────────────────────────────────────

// Cheap synchronous check: env var set? Actual liveness requires checkHealth().
export function isMcpConfigured(): boolean {
  return !!(process.env['LSEG_WC1_MCP_URL'] ?? DEFAULT_URL);
}
