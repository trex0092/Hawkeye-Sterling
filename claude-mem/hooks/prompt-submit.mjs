#!/usr/bin/env node
/**
 * UserPromptSubmit hook — runs when the user sends a prompt.
 *
 * Captures the user's intent as a workflow_note observation.
 * This creates a timeline of what the user asked for during the session.
 *
 * Reads the user prompt from stdin (Claude Code pipes it).
 */

import mem from '../index.mjs';

const sessionId = process.env.CLAUDE_SESSION_ID
  || `session-${Date.now().toString(36)}`;

try {
  // Read prompt from stdin
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString('utf8').trim();
  if (!input) process.exit(0);

  // Parse the hook payload
  let prompt;
  try {
    const payload = JSON.parse(input);
    prompt = payload.prompt || payload.message || input;
  } catch {
    prompt = input;
  }

  if (!prompt || prompt.length < 3) process.exit(0);

  // Don't record if it looks like a slash command
  if (prompt.startsWith('/')) process.exit(0);

  // Resume or start session
  const existing = mem.recentSessions(1);
  if (existing.length > 0 && !existing[0].ended_at) {
    // Session still active — use internal state
  } else {
    mem.startSession(sessionId);
  }

  // Detect compliance-relevant prompts and categorise
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

/**
 * Detect the category of a user prompt based on keywords.
 */
function categorisePrompt(prompt) {
  const lower = prompt.toLowerCase();

  if (/\b(screen|sanction|pep|watchlist|ofac|un list)\b/.test(lower)) return 'screening_result';
  if (/\b(file|str|sar|dpmsr|goaml|filing)\b/.test(lower)) return 'filing_activity';
  if (/\b(mlro|reporting officer|escalat)\b/.test(lower)) return 'mlro_directive';
  if (/\b(risk|assess|cdd|edd|due diligence)\b/.test(lower)) return 'risk_assessment';
  if (/\b(regul|law|decree|circular|fatf)\b/.test(lower)) return 'regulatory_observation';
  if (/\b(entity|counterpart|customer|client)\b/.test(lower)) return 'entity_interaction';
  if (/\b(decid|approv|reject|close|block)\b/.test(lower)) return 'compliance_decision';

  return 'workflow_note';
}

/**
 * Assess the importance of a prompt (1-10).
 */
function assessImportance(prompt) {
  const lower = prompt.toLowerCase();

  // High importance: filing, MLRO, blocking decisions
  if (/\b(str|sar|file|block|reject|mlro|escalat|suspicious)\b/.test(lower)) return 8;

  // Medium-high: screening, risk assessment
  if (/\b(screen|sanction|risk|cdd|edd|pep)\b/.test(lower)) return 7;

  // Medium: regulatory, entity management
  if (/\b(regul|entity|counterpart|deadline|compliance)\b/.test(lower)) return 6;

  // Default
  return 4;
}
