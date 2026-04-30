#!/usr/bin/env node
// Hawkeye Sterling — weaponized MCP server.
//
// Exposes the AML/CFT/sanctions screening brain to any MCP client (Claude
// Desktop, Claude Code, the API) as a curated tool palette plus a single
// `weaponized_screening` prompt that loads the full Charter P1-P10, the
// 200-mode reasoning catalogue, and the citation-enforcement doctrine into
// the client's system prompt. The MCP client thereby becomes a regulator-
// grade AML/CFT advisor; this server enforces the charter by construction
// (deterministic redlines, audit hashes, no fabrication of evidence, etc.).
//
// Transport: stdio. Wire into Claude Desktop via:
//   "mcpServers": {
//     "hawkeye-sterling": {
//       "command": "node",
//       "args": ["<absolute path>/dist/src/mcp/server.js"]
//     }
//   }
// See src/mcp/README.md for the full setup recipe.

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

// ---------------------------------------------------------------------------
// Tool catalogue (JSON Schema). Every tool is charter-compliant by construction.
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'hawkeye_screen',
    description:
      'Run the full Hawkeye-Sterling screening engine on a subject. Returns a ' +
      'BrainVerdict with outcome, posterior, methodology, reasoning chain, ' +
      'conflicts, cognitive firepower, and (when evidenceIndex is supplied) ' +
      'the credibility×freshness-weighted evidence-weighted summary. The ' +
      'verdict is the canonical artifact for MLRO disposition.',
    inputSchema: {
      type: 'object',
      properties: {
        subject: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { enum: ['individual', 'entity', 'vessel', 'wallet', 'aircraft'] },
            jurisdiction: { type: 'string' },
            nationality: { type: 'string' },
            dateOfBirth: { type: 'string' },
            dateOfIncorporation: { type: 'string' },
            aliases: { type: 'array', items: { type: 'string' } },
            identifiers: { type: 'object', additionalProperties: { type: 'string' } },
          },
          required: ['name', 'type'],
        },
        evidence: {
          type: 'object',
          description:
            'Free-form evidence bag — sanctionsHits, pepHits, adverseMedia, ' +
            'uboChain, transactions, documents, freeText. Per-key shapes are ' +
            'tolerant; the engine consumes whatever modes can use.',
        },
        evidenceIndex: {
          type: 'object',
          description:
            'Map of EvidenceItem id → EvidenceItem. When supplied, fusion ' +
            'applies credibility×freshness weighting per cited LR and the ' +
            'evidence-weighted adjunct runs (credibility×freshness blend, ' +
            'P8 cap on training-data citations, posterior pull on weak stacks).',
        },
        domains: { type: 'array', items: { type: 'string' } },
        primaryHypothesis: {
          enum: ['illicit_risk', 'sanctioned', 'pep', 'material_concern', 'adverse_media_linked', 'ubo_opaque'],
        },
        prior: { type: 'number', minimum: 0, maximum: 1 },
        maxModes: { type: 'integer', minimum: 1 },
      },
      required: ['subject'],
    },
  },
  {
    name: 'hawkeye_evaluate_redlines',
    description:
      'Given a list of fired redline IDs, return the consolidated overriding ' +
      'action: freeze > block > escalate_immediately > exit_relationship > ' +
      'do_not_onboard. Redlines are the brain\'s last safety layer and ' +
      'override any score-based logic.',
    inputSchema: {
      type: 'object',
      properties: {
        firedIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['firedIds'],
    },
  },
  {
    name: 'hawkeye_list_redlines',
    description:
      'Return the full hard-stop redlines catalogue: id, label, precondition, ' +
      'action, regulatory anchor, severity. Use to surface "what would trigger ' +
      'a freeze" to an MLRO before disposition.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'hawkeye_classify_pep',
    description:
      'Classify a role description (string from a verifiable source) into PEP ' +
      'tier + type + salience. Drives the EDD regime and review cadence. Per ' +
      'Charter P8 — never assert PEP status from training data; the role ' +
      'string MUST come from a primary source already attached by the caller.',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string' },
      },
      required: ['role'],
    },
  },
  {
    name: 'hawkeye_match_entity',
    description:
      'Pairwise entity resolver. Decides whether two records refer to the same ' +
      'real-world entity using name ensemble (Levenshtein/Jaro-Winkler/Soundex/' +
      'Double Metaphone) + alias expansion + identifier overlap + DOB/incorp-' +
      'date proximity + nationality match + charter caps. Returns confidence ' +
      'band + score + agreements + disagreements + caps.',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'object' },
        b: { type: 'object' },
      },
      required: ['a', 'b'],
    },
  },
  {
    name: 'hawkeye_corroborate_evidence',
    description:
      'Score multi-source corroboration of an evidence set ∈ [0,1]. Penalises ' +
      'shared publishers, stale dates, low credibility; rewards kind+publisher ' +
      'diversity, recency, primary/authoritative sources. Charter P2/P8 — the ' +
      'function is deliberately conservative, under-scoring is preferred over ' +
      'over-claiming.',
    inputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object' } },
        staleMaxDays: { type: 'number' },
      },
      required: ['items'],
    },
  },
  {
    name: 'hawkeye_sanction_delta',
    description:
      'Diff two NormalisedListEntry snapshots of the same sanctions list. ' +
      'Returns additions / removals / material amendments — the input to the ' +
      'delta-screen pass that re-screens every customer against new ' +
      'designations between snapshots.',
    inputSchema: {
      type: 'object',
      properties: {
        previous: { type: 'array', items: { type: 'object' } },
        current: { type: 'array', items: { type: 'object' } },
      },
      required: ['previous', 'current'],
    },
  },
  {
    name: 'hawkeye_analyse_adverse_media',
    description:
      'Run the weaponized adverse-media analyser over a list of articles ' +
      '(TaranisItem shape: { id, url, title, content, publishedAt, language? }). ' +
      'Returns FATF-mapped severity tiers, SAR triggers (R.20), counterfactual ' +
      'analysis, and a regulator-facing investigation narrative with mode ' +
      'citations.',
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        items: { type: 'array', items: { type: 'object' } },
      },
      required: ['subject', 'items'],
    },
  },
  {
    name: 'hawkeye_brain_manifest',
    description:
      'Return the weaponized brain manifest: counts of faculties, reasoning ' +
      'modes (by category and wave), adverse-media categories, doctrines, red ' +
      'flags, typologies, sanction regimes, jurisdictions, DPMS KPIs, redlines, ' +
      'FATF recommendations, dispositions, plus the three integrity hashes ' +
      '(charterHash / catalogueHash / compositeHash) the agent must echo in ' +
      'its AUDIT_LINE per the integrity block.',
    inputSchema: { type: 'object', properties: {} },
  },
] as const;

// ---------------------------------------------------------------------------
// Server + transport
// ---------------------------------------------------------------------------

const server = new Server(
  { name: PRODUCT_NAME, version: PRODUCT_VERSION },
  { capabilities: { tools: {}, prompts: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  try {
    const result = await dispatch(name, args);
    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new McpError(ErrorCode.InternalError, `${name} failed: ${msg}`);
  }
});

async function dispatch(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'hawkeye_screen':
      return await callScreen(args);
    case 'hawkeye_evaluate_redlines':
      return evaluateRedlines(asStringArray(args.firedIds));
    case 'hawkeye_list_redlines':
      return REDLINES;
    case 'hawkeye_classify_pep':
      return classifyPepRole(asString(args.role));
    case 'hawkeye_match_entity':
      return resolveEntities(args.a as EntityRecord, args.b as EntityRecord);
    case 'hawkeye_corroborate_evidence': {
      const opts: CorroborationOptions = {};
      if (typeof args.staleMaxDays === 'number') opts.staleMaxDays = args.staleMaxDays;
      return corroborate((args.items as EvidenceItem[]) ?? [], opts);
    }
    case 'hawkeye_sanction_delta':
      return computeSanctionDelta(
        (args.previous as NormalisedListEntry[]) ?? [],
        (args.current as NormalisedListEntry[]) ?? [],
      );
    case 'hawkeye_analyse_adverse_media':
      return analyseAdverseMediaItems(
        asString(args.subject),
        // TaranisItem shape; opaque to this server, the analyser validates.
        (args.items as Parameters<typeof analyseAdverseMediaItems>[1]) ?? [],
      );
    case 'hawkeye_brain_manifest': {
      return {
        manifest: buildWeaponizedBrainManifest(),
        integrity: weaponizedIntegrity(),
      };
    }
    default:
      throw new McpError(ErrorCode.MethodNotFound, `unknown tool: ${name}`);
  }
}

async function callScreen(args: Record<string, unknown>) {
  const subject = args.subject as Subject | undefined;
  if (!subject || typeof subject.name !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'subject.name is required');
  }
  const opts: RunOptions = { subject };
  if (args.evidence && typeof args.evidence === 'object') {
    opts.evidence = args.evidence as Evidence;
  }
  if (args.evidenceIndex && typeof args.evidenceIndex === 'object') {
    const entries = Object.entries(args.evidenceIndex as Record<string, EvidenceItem>);
    opts.evidenceIndex = new Map(entries);
  }
  if (Array.isArray(args.domains)) {
    opts.domains = args.domains.filter((x): x is string => typeof x === 'string');
  }
  if (typeof args.primaryHypothesis === 'string') {
    opts.primaryHypothesis = args.primaryHypothesis as Hypothesis;
  }
  if (typeof args.prior === 'number') opts.prior = args.prior;
  if (typeof args.maxModes === 'number') opts.maxModes = args.maxModes;
  return await engineRun(opts);
}

function asString(v: unknown): string {
  if (typeof v !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'expected string argument');
  }
  return v;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) {
    throw new McpError(ErrorCode.InvalidParams, 'expected array argument');
  }
  return v.filter((x): x is string => typeof x === 'string');
}

// ---------------------------------------------------------------------------
// Prompts: weaponized_screening — the system-prompt loader.
// ---------------------------------------------------------------------------

const PROMPTS = [
  {
    name: 'weaponized_screening',
    description:
      'Load the full weaponized Hawkeye-Sterling system prompt: Charter P1-P10, ' +
      '200 reasoning modes, 10 faculties, adverse-media taxonomy, doctrines, ' +
      'red flags, typologies, sanction regimes, redlines, FATF recommendations, ' +
      'meta-cognition primitives, cognitive amplifier, and citation enforcement. ' +
      'Use as the system prompt for any AML/CFT/sanctions screening session. ' +
      'The agent MUST echo the three integrity hashes in its AUDIT_LINE.',
    arguments: [
      {
        name: 'taskRole',
        description:
          'Optional task-role suffix appended after the charter — e.g. ' +
          '"Screen Acme Trading LLC for sanctions and adverse media; build the ' +
          'STR draft if outcome is escalate or block."',
        required: false,
      },
      {
        name: 'audience',
        description: 'Audience for the verdict. Default: MLRO.',
        required: false,
      },
    ],
  },
] as const;

server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));

server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  if (req.params.name !== 'weaponized_screening') {
    throw new McpError(ErrorCode.MethodNotFound, `unknown prompt: ${req.params.name}`);
  }
  const argMap = req.params.arguments ?? {};
  const opts: WeaponizedSystemPromptOptions = {};
  if (typeof argMap.taskRole === 'string') opts.taskRole = argMap.taskRole;
  opts.audience = typeof argMap.audience === 'string' ? argMap.audience : 'MLRO';
  const prompt = weaponizedSystemPrompt(opts);
  return {
    description:
      'Hawkeye-Sterling weaponized charter + cognitive catalogue + citation ' +
      'enforcement. Use as the agent\'s system context for AML/CFT screening.',
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: prompt },
      },
    ],
  };
});

// ---------------------------------------------------------------------------
// Connect stdio transport. stdout is reserved for MCP traffic; stderr is safe.
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`[${PRODUCT_NAME}] connected (v${PRODUCT_VERSION})\n`);
