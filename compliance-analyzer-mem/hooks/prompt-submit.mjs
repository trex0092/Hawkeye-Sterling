#!/usr/bin/env node
/**
 * UserPromptSubmit hook for Compliance Analyzer.
 * Detects compliance-analyzer-specific patterns (thresholds, goAML,
 * supply chain, RBAC, approvals).
 */

import mem from '../index.mjs';

const sessionId = process.env.CLAUDE_SESSION_ID
  || `session-${Date.now().toString(36)}`;

try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = Buffer.concat(chunks).toString('utf8').trim();
  if (!input) process.exit(0);

  let prompt;
  try {
    const payload = JSON.parse(input);
    prompt = payload.prompt || payload.message || input;
  } catch { prompt = input; }

  if (!prompt || prompt.length < 3 || prompt.startsWith('/')) process.exit(0);

  const existing = mem.recentSessions(1);
  if (existing.length === 0 || existing[0].ended_at) {
    mem.startSession(sessionId);
  }

  const category = categorisePrompt(prompt);
  const importance = assessImportance(prompt);

  mem.observe({
    category,
    content: `User request: ${prompt.slice(0, 500)}`,
    importance,
  });

  console.error(`[claude-mem] Prompt recorded (${category}, importance: ${importance})`);
} catch (err) {
  console.error(`[claude-mem] prompt-submit error: ${err.message}`);
  process.exit(0);
} finally {
  mem.close();
}

function categorisePrompt(prompt) {
  const lower = prompt.toLowerCase();
  if (/\b(screen|sanction|pep|watchlist|ofac|un list)\b/.test(lower)) return 'screening_result';
  if (/\b(file|str|sar|dpmsr|goaml|filing)\b/.test(lower)) return 'filing_activity';
  if (/\b(mlro|reporting officer|escalat)\b/.test(lower)) return 'mlro_directive';
  if (/\b(risk|assess|cdd|edd|due diligence)\b/.test(lower)) return 'risk_assessment';
  if (/\b(regul|law|decree|circular|fatf|lbma)\b/.test(lower)) return 'regulatory_observation';
  if (/\b(entity|counterpart|customer|client|onboard)\b/.test(lower)) return 'entity_interaction';
  if (/\b(threshold|aed 55|aed 60|55.?000|60.?000|cross.?border)\b/.test(lower)) return 'threshold_alert';
  if (/\b(supply.?chain|gold|bullion|precious|dpms)\b/.test(lower)) return 'supply_chain_event';
  if (/\b(approv|reject|close|block|decid)\b/.test(lower)) return 'compliance_decision';
  return 'workflow_note';
}

function assessImportance(prompt) {
  const lower = prompt.toLowerCase();
  if (/\b(str|sar|file|block|reject|mlro|escalat|suspicious|freeze)\b/.test(lower)) return 8;
  if (/\b(screen|sanction|risk|cdd|edd|pep|threshold)\b/.test(lower)) return 7;
  if (/\b(regul|entity|counterpart|deadline|compliance|supply.?chain)\b/.test(lower)) return 6;
  return 4;
}
