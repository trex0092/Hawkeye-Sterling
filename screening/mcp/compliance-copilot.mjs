#!/usr/bin/env node
/**
 * MCP Compliance Copilot — Model Context Protocol server.
 *
 * Exposes the full Hawkeye-Sterling compliance toolkit as MCP tools
 * that Claude Code can call natively during any session:
 *
 *   screen          — Sanctions + PEP + adverse media screening
 *   jurisdiction    — Jurisdiction risk briefing with intelligence feed
 *   threshold_check — AED 55K/60K threshold analysis
 *   entity_risk     — Entity composite risk score
 *   filing_draft    — Auto-draft STR/SAR/CTR with goAML XML
 *   mem_search      — Search compliance memory across sessions
 *   mem_observe     — Record a compliance observation
 *   entity_graph    — Query entity relationship graph
 *
 * Runs as a stdio MCP server. Register in .mcp.json:
 *   { "mcpServers": { "compliance": { "command": "node", "args": ["screening/mcp/compliance-copilot.mjs"] } } }
 *
 * Protocol: JSON-RPC 2.0 over stdin/stdout (MCP standard).
 */

import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// ── Tool Definitions ────────────────────────────────────────

const TOOLS = [
  {
    name: 'screen',
    description: 'Screen a person or entity against sanctions, PEP, and adverse media lists. Returns match score, band (clear/low/medium/high), matched lists, and adverse media hits.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name of the person or entity to screen' },
        country: { type: 'string', description: 'ISO 2-letter country code (optional)' },
        type: { type: 'string', enum: ['person', 'entity', 'vessel'], description: 'Subject type (default: person)' },
        include_adverse_media: { type: 'boolean', description: 'Include GDELT adverse media search (default: true)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'jurisdiction',
    description: 'Get a jurisdiction risk briefing with World Monitor intelligence. Returns recent sanctions events, FATF status, risk lift score, and recommended actions.',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string', description: 'ISO 2-letter country code' },
        hours: { type: 'number', description: 'Lookback window in hours (default: 72)' },
      },
      required: ['country'],
    },
  },
  {
    name: 'threshold_check',
    description: 'Check if a transaction amount triggers UAE reporting thresholds. Returns which thresholds are breached and required actions.',
    inputSchema: {
      type: 'object',
      properties: {
        amount_aed: { type: 'number', description: 'Transaction amount in AED' },
        is_cross_border: { type: 'boolean', description: 'Is this a cross-border transaction?' },
        is_cash: { type: 'boolean', description: 'Is this a cash transaction?' },
        entity_name: { type: 'string', description: 'Counterparty name (optional)' },
      },
      required: ['amount_aed'],
    },
  },
  {
    name: 'entity_risk',
    description: 'Calculate composite risk score for an entity. Combines sanctions screening, jurisdiction risk, transaction patterns, and PEP status into a single risk rating (1-25).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Entity name' },
        country: { type: 'string', description: 'Country of incorporation/residence' },
        is_pep: { type: 'boolean', description: 'Is the entity a PEP?' },
        annual_volume_aed: { type: 'number', description: 'Expected annual transaction volume in AED' },
        product_type: { type: 'string', enum: ['fine_gold', 'gold_jewellery', 'precious_stones', 'mixed'], description: 'Product type' },
      },
      required: ['name', 'country'],
    },
  },
  {
    name: 'filing_draft',
    description: 'Auto-draft a compliance filing (STR, SAR, CTR, DPMSR, CNMR). Returns plain-text draft and goAML XML. Tracks filing deadline.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['STR', 'SAR', 'CTR', 'DPMSR', 'CNMR'], description: 'Filing type' },
        subject_name: { type: 'string', description: 'Subject of the filing' },
        narrative: { type: 'string', description: 'Brief description of suspicious activity or trigger event' },
        amount_aed: { type: 'number', description: 'Transaction amount (if applicable)' },
        trigger_date: { type: 'string', description: 'Date of trigger event (YYYY-MM-DD)' },
      },
      required: ['type', 'subject_name', 'narrative'],
    },
  },
  {
    name: 'mem_search',
    description: 'Search the compliance memory system for past observations, decisions, screenings, and directives across all sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        category: { type: 'string', description: 'Filter by category (screening_result, compliance_decision, mlro_directive, etc.)' },
        entity: { type: 'string', description: 'Filter by entity name' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'mem_observe',
    description: 'Record a compliance observation in the memory system. Use after making decisions, completing screenings, or noting regulatory changes.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['screening_result', 'compliance_decision', 'regulatory_observation', 'entity_interaction', 'filing_activity', 'mlro_directive', 'risk_assessment', 'workflow_note', 'error_resolution', 'architecture_change'],
          description: 'Observation category',
        },
        content: { type: 'string', description: 'Observation content' },
        entity_name: { type: 'string', description: 'Related entity name (optional)' },
        importance: { type: 'number', description: 'Importance 1-10 (default: 5)' },
      },
      required: ['category', 'content'],
    },
  },
  {
    name: 'entity_graph',
    description: 'Query the entity relationship graph. Find connections between counterparties, detect shared addresses/UBOs, and flag links to sanctioned entities.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_name: { type: 'string', description: 'Entity to query' },
        depth: { type: 'number', description: 'Relationship depth (1-3, default: 2)' },
        include_sanctions: { type: 'boolean', description: 'Check connections against sanctions lists (default: true)' },
      },
      required: ['entity_name'],
    },
  },
];

// ── Tool Handlers ───────────────────────────────────────────

async function handleScreen(params) {
  try {
    const screening = await import(resolve(PROJECT_ROOT, 'screening', 'index.js'));
    await screening.init();
    const result = await screening.screen(params.name, {
      type: params.type || 'person',
      country: params.country,
    });

    let adverseMedia = null;
    if (params.include_adverse_media !== false) {
      try {
        const { search, scoreAdverseMedia } = await import(resolve(PROJECT_ROOT, 'screening', 'sources', 'adverse-media.js'));
        const articles = await search(params.name, { limit: 10 });
        adverseMedia = scoreAdverseMedia(articles);
        adverseMedia.articles = articles.slice(0, 5).map(a => ({ title: a.title, url: a.url, tone: a.tone }));
      } catch (err) { process.stderr.write(`[compliance-copilot] adverse media lookup failed: ${err.message}\n`); }
    }

    // Record in memory
    await recordMemory('screening_result',
      `Screened "${params.name}": score=${result.score}, band=${result.band}, matches=${result.matches?.length || 0}`,
      params.name, result.band === 'high' ? 9 : result.band === 'medium' ? 7 : 5);

    return {
      subject: params.name,
      score: result.score,
      band: result.band,
      matches: result.matches || [],
      adverse_media: adverseMedia,
      recommendation: getScreeningRecommendation(result),
    };
  } catch (err) {
    return { error: err.message, hint: 'Ensure screening module is initialized: cd screening && node bin/refresh.mjs' };
  }
}

async function handleJurisdiction(params) {
  try {
    const { jurisdictionBriefing } = await import(resolve(PROJECT_ROOT, 'screening', 'sources', 'worldmonitor.js'));
    const briefing = await jurisdictionBriefing(params.country, {
      hours: params.hours || 72,
      cacheDir: resolve(PROJECT_ROOT, '.screening', 'cache'),
    });

    await recordMemory('risk_assessment',
      `Jurisdiction briefing ${params.country}: ${briefing.events.length} signals, lift=${briefing.score.lift}`,
      params.country, briefing.score.lift >= 0.05 ? 8 : 6);

    return briefing;
  } catch (err) {
    return { error: err.message };
  }
}

async function handleThresholdCheck(params) {
  const { amount_aed, is_cross_border, is_cash, entity_name } = params;
  const breaches = [];
  const actions = [];

  if (is_cash && amount_aed >= 55000) {
    breaches.push({ threshold: 'AED 55,000', type: 'DPMS Cash Transaction Report', regulation: 'MoE Circular 08/AML/2021' });
    actions.push('File CTR/DPMSR via goAML within 15 business days');
  }

  if (is_cross_border && amount_aed >= 60000) {
    breaches.push({ threshold: 'AED 60,000', type: 'Cross-Border Declaration', regulation: 'Cabinet Res 134/2025 Art.16' });
    actions.push('Ensure declaration filed with customs');
  }

  if (amount_aed >= 200000) {
    actions.push('Enhanced due diligence recommended for high-value transaction');
  }

  const result = {
    amount_aed,
    breaches,
    actions,
    requires_filing: breaches.length > 0,
    entity_name: entity_name || null,
  };

  if (breaches.length > 0) {
    await recordMemory('compliance_decision',
      `Threshold breach: AED ${amount_aed.toLocaleString()} (${breaches.map(b => b.type).join(', ')})`,
      entity_name, 8);
  }

  return result;
}

async function handleEntityRisk(params) {
  const { name, country, is_pep, annual_volume_aed, product_type } = params;

  // Likelihood factors (1-5)
  let likelihood = 1;
  const factors = [];

  // Jurisdiction risk
  const blacklist = ['IR', 'KP', 'MM'];
  const greylist = ['AL', 'BG', 'BF', 'CM', 'HR', 'CD', 'HT', 'KE', 'LA', 'LB', 'MC', 'MZ', 'NA', 'NG', 'PH', 'ZA', 'SS', 'SY', 'TZ', 'VE', 'VN', 'YE'];

  if (blacklist.includes(country)) {
    likelihood += 3; factors.push(`FATF blacklist jurisdiction (${country})`);
  } else if (greylist.includes(country)) {
    likelihood += 2; factors.push(`FATF greylist jurisdiction (${country})`);
  }

  // PEP status
  if (is_pep) { likelihood += 2; factors.push('PEP status confirmed'); }

  // Volume risk
  if (annual_volume_aed > 5000000) { likelihood += 1; factors.push('High annual volume (>AED 5M)'); }

  // Product risk
  if (product_type === 'fine_gold') { likelihood += 1; factors.push('Fine gold (high inherent risk)'); }

  likelihood = Math.min(5, likelihood);

  // Impact is always high for DPMS (regulatory, reputational)
  const impact = 4;
  const score = likelihood * impact;

  let rating, cdd_level, review_cycle;
  if (score >= 16) {
    rating = 'HIGH'; cdd_level = 'EDD'; review_cycle = '3 months';
  } else if (score >= 6) {
    rating = 'MEDIUM'; cdd_level = 'CDD'; review_cycle = '6 months';
  } else {
    rating = 'LOW'; cdd_level = 'SDD'; review_cycle = '12 months';
  }

  const result = {
    entity: name,
    country,
    risk_score: score,
    rating,
    likelihood,
    impact,
    cdd_level,
    review_cycle,
    factors,
    requires_senior_approval: score >= 16 || is_pep,
    next_action: score >= 16
      ? 'Escalate to Senior Management for EDD approval (FDL Art.14)'
      : `Proceed with ${cdd_level} onboarding`,
  };

  await recordMemory('risk_assessment',
    `Entity risk: ${name} (${country}) = ${score} (${rating}), CDD: ${cdd_level}`,
    name, score >= 16 ? 8 : 6);

  return result;
}

async function handleFilingDraft(params) {
  try {
    const { generateFiling } = await import(resolve(PROJECT_ROOT, 'scripts', 'filing-pipeline', 'generator.mjs'));
    const result = await generateFiling(params);

    await recordMemory('filing_activity',
      `Filing drafted: ${params.type} for "${params.subject_name}" — ${params.narrative.slice(0, 100)}`,
      params.subject_name, 9);

    return result;
  } catch (err) {
    return { error: err.message, hint: 'Filing pipeline module may need setup' };
  }
}

async function handleMemSearch(params) {
  let mem;
  try {
    mem = (await import(resolve(PROJECT_ROOT, 'claude-mem', 'index.mjs'))).default;
    const results = mem.search(params.query, {
      category: params.category,
      entity: params.entity,
      limit: params.limit || 20,
    });
    return { results, count: results.length };
  } catch (err) {
    return { error: err.message };
  } finally {
    if (mem) try { mem.close(); } catch { /* ignore close errors */ }
  }
}

async function handleMemObserve(params) {
  try {
    await recordMemory(params.category, params.content, params.entity_name, params.importance || 5);
    return { recorded: true };
  } catch (err) {
    return { error: err.message };
  }
}

async function handleEntityGraph(params) {
  try {
    const { queryGraph } = await import(resolve(PROJECT_ROOT, 'screening', 'graph', 'entity-graph.mjs'));
    const result = await queryGraph(params.entity_name, {
      depth: params.depth || 2,
      includeSanctions: params.include_sanctions !== false,
    });
    return result;
  } catch (err) {
    return { error: err.message };
  }
}

// ── Helpers ─────────────────────────────────────────────────

function getScreeningRecommendation(result) {
  if (!result || !result.band) return 'Unable to determine recommendation.';
  switch (result.band) {
    case 'high': return 'FREEZE immediately. Start 24h EOCN countdown. File CNMR within 5 business days. DO NOT notify the subject.';
    case 'medium': return 'Escalate to Compliance Officer for manual review. Potential match requires human determination.';
    case 'low': return 'Low-confidence match. Document reasoning and dismiss if false positive.';
    default: return 'No match found. Clear to proceed.';
  }
}

async function recordMemory(category, content, entityName, importance = 5) {
  let mem;
  try {
    mem = (await import(resolve(PROJECT_ROOT, 'claude-mem', 'index.mjs'))).default;
    mem.startSession(`mcp-${Date.now().toString(36)}`);
    mem.observe({ category, content, entityName, importance });
    await mem.endSession();
  } catch (err) {
    process.stderr.write(`[compliance-copilot] memory record failed: ${err.message}\n`);
  } finally {
    if (mem) try { mem.close(); } catch { /* ignore close errors */ }
  }
}

// ── MCP Protocol Handler ────────────────────────────────────

const DISPATCH = {
  screen: handleScreen,
  jurisdiction: handleJurisdiction,
  threshold_check: handleThresholdCheck,
  entity_risk: handleEntityRisk,
  filing_draft: handleFilingDraft,
  mem_search: handleMemSearch,
  mem_observe: handleMemObserve,
  entity_graph: handleEntityGraph,
};

function sendResponse(id, result) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(msg + '\n');
}

function sendError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
  process.stdout.write(msg + '\n');
}

async function handleRequest(request) {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      return sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'hawkeye-compliance-copilot', version: '1.0.0' },
      });

    case 'notifications/initialized':
      return; // No response needed

    case 'tools/list':
      return sendResponse(id, { tools: TOOLS });

    case 'tools/call': {
      const toolName = params?.name;
      const handler = DISPATCH[toolName];
      if (!handler) return sendError(id, -32601, `Unknown tool: ${toolName}`);

      try {
        const result = await handler(params?.arguments || {});
        return sendResponse(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      } catch (err) {
        return sendResponse(id, {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true,
        });
      }
    }

    default:
      if (id) sendError(id, -32601, `Method not found: ${method}`);
  }
}

// ── Stdin/Stdout Transport ──────────────────────────────────

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line.trim());
    await handleRequest(request);
  } catch (err) {
    sendError(null, -32700, `Parse error: ${err.message}`);
  }
});

process.stderr.write('[compliance-copilot] MCP server started\n');
