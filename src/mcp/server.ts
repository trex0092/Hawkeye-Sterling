#!/usr/bin/env node
// Hawkeye Sterling — weaponized MCP server (audit follow-up #50, re-vivified).
//
// Exposes the brain to any MCP client (Claude Desktop, Claude Code,
// Cursor, etc.) over stdio. Loads `weaponizedSystemPrompt()` as a
// reusable prompt template + the brain's deterministic functions as
// tool-use schemas. Charter-compliant by construction (P1-P10 + redlines).
//
// Run: `npm run mcp:serve` after `npm run build`.
// Wire into Claude Desktop via:
//   { "mcpServers": { "hawkeye-sterling": { "command": "node",
//     "args": ["<repo>/dist/src/mcp/server.js"] } } }

import { createHmac } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { run as engineRun, type RunOptions } from '../brain/engine.js';
import {
  buildWeaponizedBrainManifest,
  weaponizedIntegrity,
  weaponizedSystemPrompt,
  type WeaponizedSystemPromptOptions,
} from '../brain/weaponized.js';
import { REDLINES, evaluateRedlines } from '../brain/redlines.js';
import { classifyPepRole } from '../brain/pep-classifier.js';
import { resolveEntities, type EntityRecord } from '../brain/entity-resolution.js';
import { corroborate, type CorroborationOptions } from '../brain/evidence-corroboration.js';
import { computeSanctionDelta } from '../brain/sanction-delta.js';
import { analyseAdverseMediaItems } from '../brain/adverse-media-analyser.js';
import type { EvidenceItem } from '../brain/evidence.js';
import type { Evidence, Hypothesis, Subject } from '../brain/types.js';
import type { NormalisedListEntry } from '../brain/watchlist-adapters.js';

const PRODUCT_NAME = 'hawkeye-sterling';
const PRODUCT_VERSION = '0.2.0';

const TOOLS = [
  { name: 'hawkeye_screen', description: 'Run engine.run() — full BrainVerdict.', inputSchema: { type: 'object', properties: { subject: { type: 'object' }, evidence: { type: 'object' }, evidenceIndex: { type: 'object' }, regimeStatuses: { type: 'array' } }, required: ['subject'] } },
  { name: 'hawkeye_evaluate_redlines', description: 'Consolidated overriding action from fired redline ids.', inputSchema: { type: 'object', properties: { firedIds: { type: 'array', items: { type: 'string' } } }, required: ['firedIds'] } },
  { name: 'hawkeye_list_redlines', description: 'Hard-stop redlines catalogue.', inputSchema: { type: 'object', properties: {} } },
  { name: 'hawkeye_classify_pep', description: 'Role string → PEP tier + type + salience (P8: source must be verifiable).', inputSchema: { type: 'object', properties: { role: { type: 'string' } }, required: ['role'] } },
  { name: 'hawkeye_match_entity', description: 'Pairwise entity resolver with charter caps.', inputSchema: { type: 'object', properties: { a: { type: 'object' }, b: { type: 'object' } }, required: ['a', 'b'] } },
  { name: 'hawkeye_corroborate_evidence', description: 'Multi-source corroboration score ∈ [0,1].', inputSchema: { type: 'object', properties: { items: { type: 'array' }, staleMaxDays: { type: 'number' } }, required: ['items'] } },
  { name: 'hawkeye_sanction_delta', description: 'Diff two NormalisedListEntry snapshots.', inputSchema: { type: 'object', properties: { previous: { type: 'array' }, current: { type: 'array' } }, required: ['previous', 'current'] } },
  { name: 'hawkeye_analyse_adverse_media', description: 'FATF-mapped adverse-media analyser.', inputSchema: { type: 'object', properties: { subject: { type: 'string' }, items: { type: 'array' } }, required: ['subject', 'items'] } },
  { name: 'hawkeye_brain_manifest', description: 'Manifest counts + integrity hashes.', inputSchema: { type: 'object', properties: {} } },
  { name: 'hawkeye_verify_attestation', description: 'Verify MCPS attestation signature for a previous tool response.', inputSchema: { type: 'object', properties: { tool: { type: 'string' }, ts: { type: 'string' }, sig: { type: 'string' }, args: { type: 'object' }, result: { type: 'object' } }, required: ['tool', 'ts', 'sig'] } },
] as const;

const PROMPTS = [
  { name: 'weaponized_screening', description: 'Load Charter P1-P10 + 200 reasoning modes + meta-cognition + amplifier + citation enforcement.', arguments: [{ name: 'taskRole', required: false }, { name: 'audience', required: false }] },
] as const;

const server = new Server({ name: PRODUCT_NAME, version: PRODUCT_VERSION }, { capabilities: { tools: {}, prompts: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));

function buildMcpsAttestation(tool: string, args: Record<string, unknown>, result: unknown): {
  _mcps: {
    tool: string;
    ts: string;
    sig: string | null;
    alg: string;
    warning?: string;
  };
} {
  const ts = new Date().toISOString();
  const key = process.env['MCP_SIGNING_KEY'];
  if (!key) {
    return { _mcps: { tool, ts, sig: null, alg: 'hmac-sha256', warning: 'MCP_SIGNING_KEY not set — attestation disabled' } };
  }
  const payload = `${tool}|${ts}|${JSON.stringify(args)}|${JSON.stringify(result)}`;
  const sig = createHmac('sha256', key).update(payload).digest('hex');
  return { _mcps: { tool, ts, sig, alg: 'hmac-sha256' } };
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  try {
    const result = await dispatch(name, args);
    const attestation = buildMcpsAttestation(name, args, result);
    return {
      content: [
        { type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) },
        { type: 'text', text: JSON.stringify(attestation, null, 2) },
      ]
    };
  } catch (err) {
    throw new McpError(ErrorCode.InternalError, `${name} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
});

server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  if (req.params.name !== 'weaponized_screening') {
    throw new McpError(ErrorCode.MethodNotFound, `unknown prompt: ${req.params.name}`);
  }
  const argMap = req.params.arguments ?? {};
  const opts: WeaponizedSystemPromptOptions = {};
  if (typeof argMap['taskRole'] === 'string') opts.taskRole = argMap['taskRole'];
  opts.audience = typeof argMap['audience'] === 'string' ? argMap['audience'] : 'MLRO';
  const prompt = weaponizedSystemPrompt(opts);
  return {
    description: 'Hawkeye-Sterling weaponized charter + cognitive catalogue + citation enforcement.',
    messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
  };
});

async function dispatch(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'hawkeye_screen': {
      const subject = args['subject'] as Subject | undefined;
      if (!subject?.name) throw new McpError(ErrorCode.InvalidParams, 'subject.name required');
      const opts: RunOptions = { subject };
      if (args['evidence'] && typeof args['evidence'] === 'object') opts.evidence = args['evidence'] as Evidence;
      if (args['evidenceIndex'] && typeof args['evidenceIndex'] === 'object') {
        opts.evidenceIndex = new Map(Object.entries(args['evidenceIndex'] as Record<string, EvidenceItem>));
      }
      if (typeof args['primaryHypothesis'] === 'string') opts.primaryHypothesis = args['primaryHypothesis'] as Hypothesis;
      return await engineRun(opts);
    }
    case 'hawkeye_evaluate_redlines': return evaluateRedlines((args['firedIds'] as string[]) ?? []);
    case 'hawkeye_list_redlines': return REDLINES;
    case 'hawkeye_classify_pep': return classifyPepRole(String(args['role'] ?? ''));
    case 'hawkeye_match_entity': return resolveEntities(args['a'] as EntityRecord, args['b'] as EntityRecord);
    case 'hawkeye_corroborate_evidence': {
      const opts: CorroborationOptions = {};
      if (typeof args['staleMaxDays'] === 'number') opts.staleMaxDays = args['staleMaxDays'];
      return corroborate((args['items'] as EvidenceItem[]) ?? [], opts);
    }
    case 'hawkeye_sanction_delta': return computeSanctionDelta((args['previous'] as NormalisedListEntry[]) ?? [], (args['current'] as NormalisedListEntry[]) ?? []);
    case 'hawkeye_analyse_adverse_media': return analyseAdverseMediaItems(String(args['subject'] ?? ''), (args['items'] as Parameters<typeof analyseAdverseMediaItems>[1]) ?? []);
    case 'hawkeye_brain_manifest': return { manifest: buildWeaponizedBrainManifest(), integrity: weaponizedIntegrity() };
    case 'hawkeye_verify_attestation': {
      const { tool, ts, sig, args: aArgs, result: aResult } = args as { tool: string; ts: string; sig: string; args?: unknown; result?: unknown };
      const key = process.env['MCP_SIGNING_KEY'];
      if (!key) return { valid: false, reason: 'MCP_SIGNING_KEY not configured' };
      const payload = `${tool}|${ts}|${JSON.stringify(aArgs ?? {})}|${JSON.stringify(aResult ?? {})}`;
      const expected = createHmac('sha256', key).update(payload).digest('hex');
      return { valid: expected === sig, tool, ts };
    }
    default: throw new McpError(ErrorCode.MethodNotFound, `unknown tool: ${name}`);
  }
}

void (async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[${PRODUCT_NAME}] connected (v${PRODUCT_VERSION})\n`);
})();
