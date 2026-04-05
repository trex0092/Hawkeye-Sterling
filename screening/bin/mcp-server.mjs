#!/usr/bin/env node
/**
 * Model Context Protocol (MCP) stdio server exposing Hawkeye-Sterling
 * screening as tools that any MCP-aware LLM host (Claude Desktop,
 * Claude Code, Cursor, etc.) can call directly.
 *
 * Tools exposed:
 *   - screen_subject          screen a single name
 *   - screen_batch            screen multiple subjects
 *   - refresh_sources         refresh all enabled sanctions/PEP sources
 *   - record_decision         record an MLRO decision on a case
 *   - whitelist_entity        mark a stored entity as a false positive
 *   - verify_audit            verify the hash-chained audit log
 *   - list_sources            list configured sources + status
 *   - audit_tail              return the last N audit entries
 *
 * The server speaks JSON-RPC 2.0 over stdio, matching the MCP spec.
 * It implements initialize, tools/list, and tools/call directly without
 * depending on @modelcontextprotocol/sdk — that keeps the whole
 * screening module dependency-free.
 *
 * Register with Claude Desktop by adding to its config:
 *   {
 *     "mcpServers": {
 *       "hawkeye-screening": {
 *         "command": "node",
 *         "args": ["/abs/path/to/Hawkeye-Sterling/screening/bin/mcp-server.mjs"]
 *       }
 *     }
 *   }
 */

import { createInterface } from 'node:readline';
import Screening from '../index.js';
import { SOURCES } from '../config.js';
import { AuditLog } from '../lib/audit.js';
import { PATHS } from '../config.js';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = {
  name: 'hawkeye-sterling-screening',
  version: '1.0.0',
};

// --- Tool definitions ------------------------------------------------------

const TOOLS = [
  {
    name: 'screen_subject',
    description: 'Screen a single subject (person or entity) against loaded sanctions, PEP, and adverse-media sources. Returns match hits with confidence bands and a decision (clear/review/block). Every call is recorded in the hash-chained audit log.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name of the subject' },
        type: { type: 'string', enum: ['person', 'entity'], description: 'Subject type; inferred if omitted' },
        aliases: { type: 'array', items: { type: 'string' }, description: 'Alternative spellings / transliterations' },
        dob: { type: 'string', description: 'Date of birth (ISO YYYY-MM-DD or YYYY)' },
        countries: { type: 'array', items: { type: 'string' }, description: 'Nationalities or country codes' },
        subjectId: { type: 'string', description: 'Caller customer / case identifier for the audit log' },
        includeAdverseMedia: { type: 'boolean', description: 'Force adverse-media enrichment (default: only for medium+ matches)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'screen_batch',
    description: 'Screen many subjects in a single call. Each is audited independently.',
    inputSchema: {
      type: 'object',
      properties: {
        subjects: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              dob: { type: 'string' },
              countries: { type: 'array', items: { type: 'string' } },
              subjectId: { type: 'string' },
            },
            required: ['name'],
          },
        },
      },
      required: ['subjects'],
    },
  },
  {
    name: 'refresh_sources',
    description: 'Fetch the latest version of every enabled sanctions/PEP source (OpenSanctions, UN, OFAC SDN, UK OFSI, etc.), diff against the local store, and record additions/removals in the audit log. Use before a regulator-facing screening run.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string', description: 'Refresh only this source; omit to refresh all' },
        force: { type: 'boolean', description: 'Bypass cache TTL and re-download' },
      },
    },
  },
  {
    name: 'record_decision',
    description: 'Record an MLRO / analyst decision on a prior screening case. Appends a new entry to the immutable audit chain without modifying the original screen entry.',
    inputSchema: {
      type: 'object',
      properties: {
        caseId: { type: 'string' },
        outcome: { type: 'string', enum: ['false-positive', 'true-positive', 'escalate', 'block', 'clear'] },
        reason: { type: 'string' },
        actor: { type: 'string', description: 'Reviewer identifier (default: mlro)' },
      },
      required: ['caseId', 'outcome', 'reason'],
    },
  },
  {
    name: 'whitelist_entity',
    description: 'Mark a stored sanctions/PEP entity as a confirmed false positive for future screenings. Reversible via action=unwhitelist. All overrides are audited.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        action: { type: 'string', enum: ['whitelist', 'unwhitelist'] },
        reason: { type: 'string' },
        actor: { type: 'string' },
      },
      required: ['entityId', 'action', 'reason'],
    },
  },
  {
    name: 'verify_audit',
    description: 'Verify the hash-chained audit log from genesis to head. Returns OK or the sequence number where tampering was detected.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_sources',
    description: 'List every configured sanctions/PEP/adverse-media source with priority, URL, license, enabled status, and last refresh metadata.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'audit_tail',
    description: 'Return the most recent audit log entries for inspection. Supports filtering by type.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max entries to return (default 20)' },
        type: { type: 'string', description: 'Filter by entry type (screen, decision, refresh.diff, ...)' },
      },
    },
  },
];

// --- Tool implementations --------------------------------------------------

async function runTool(name, args) {
  switch (name) {
    case 'screen_subject': {
      const result = await Screening.screen(args, { actor: args.actor || 'mcp' });
      return {
        caseId: result.caseId,
        decision: result.decision,
        topBand: result.topBand,
        hitCount: result.hits.length,
        hits: result.hits.slice(0, 15),
        adverseMedia: result.adverseMedia?.slice(0, 10),
        auditSeq: result.auditSeq,
      };
    }
    case 'screen_batch': {
      const results = await Screening.batch(args.subjects || [], { actor: 'mcp' });
      return {
        count: results.length,
        summary: results.map(r => ({
          caseId: r.caseId,
          subject: r.query.name,
          decision: r.decision,
          topBand: r.topBand,
          hitCount: r.hits.length,
          auditSeq: r.auditSeq,
        })),
      };
    }
    case 'refresh_sources': {
      if (args.sourceId) {
        return await Screening.refreshOne(args.sourceId, { force: !!args.force });
      }
      return await Screening.refreshAll({ force: !!args.force });
    }
    case 'record_decision': {
      const entry = await Screening.decision(args.caseId, args.outcome, args.reason, args.actor || 'mlro');
      return { seq: entry.seq, hash: entry.hash, ts: entry.ts };
    }
    case 'whitelist_entity': {
      const entry = await Screening.override(args.entityId, args.action, args.reason, args.actor || 'mlro');
      return { seq: entry.seq, hash: entry.hash, ts: entry.ts };
    }
    case 'verify_audit': {
      return await Screening.verify();
    }
    case 'list_sources': {
      await Screening.init();
      const stats = Screening.stats();
      return SOURCES.map(s => ({
        id: s.id,
        name: s.name,
        url: s.url,
        license: s.license,
        priority: s.priority,
        enabled: s.enabled,
        runtime: !!s.runtime,
        lastRefresh: stats.sources?.[s.id] || null,
      }));
    }
    case 'audit_tail': {
      await Screening.init();
      const log = new AuditLog(PATHS.auditFile);
      await log.init();
      const limit = args.limit || 20;
      const type = args.type;
      const all = [];
      await log.query(type ? { type } : {}, async (e) => { all.push(e); });
      return all.slice(-limit).reverse();
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// --- JSON-RPC stdio loop ---------------------------------------------------

function send(response) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

function makeError(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

function makeResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

async function handle(req) {
  const { id, method, params } = req;
  try {
    switch (method) {
      case 'initialize':
        return makeResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: SERVER_INFO,
          capabilities: { tools: {} },
        });
      case 'tools/list':
        return makeResult(id, { tools: TOOLS });
      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const out = await runTool(toolName, toolArgs);
        return makeResult(id, {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          isError: false,
        });
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null; // no response expected
      case 'ping':
        return makeResult(id, {});
      default:
        return makeError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    return makeError(id, -32603, err.message, { stack: err.stack });
  }
}

async function main() {
  // Eagerly initialize so the first tool call isn't slow.
  await Screening.init();
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let req;
    try { req = JSON.parse(line); }
    catch { send(makeError(null, -32700, 'Parse error')); continue; }
    const res = await handle(req);
    if (res) send(res);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
