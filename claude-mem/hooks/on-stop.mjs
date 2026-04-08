#!/usr/bin/env node
/**
 * Stop hook — runs when Claude Code's response is complete.
 *
 * Takes the assistant's final response from stdin and records
 * any compliance-significant content as observations.
 */

import mem from '../index.mjs';

const sessionId = process.env.CLAUDE_SESSION_ID
  || `session-${Date.now().toString(36)}`;

try {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString('utf8').trim();
  if (!input) process.exit(0);

  let response;
  try {
    const payload = JSON.parse(input);
    response = payload.response || payload.message || payload.content || input;
  } catch {
    response = input;
  }

  if (!response || response.length < 20) process.exit(0);

  // Resume session
  const existing = mem.recentSessions(1);
  if (existing.length === 0 || existing[0].ended_at) {
    mem.startSession(sessionId);
  }

  // Extract and record compliance-significant content from the response
  const records = extractSignificantContent(response);
  for (const record of records) {
    mem.observe(record);
  }

  if (records.length > 0) {
    console.error(`[claude-mem] Recorded ${records.length} observations from response.`);
  }
} catch (err) {
  console.error(`[claude-mem] on-stop error: ${err.message}`);
  process.exit(0);
} finally {
  mem.close();
}

function extractSignificantContent(response) {
  const records = [];
  const lower = response.toLowerCase();

  // Screening conclusions
  if (/\b(no match|true positive|false positive|potential match|hit|clear)\b/.test(lower) &&
      /\b(screen|sanction|pep|watchlist)\b/.test(lower)) {
    records.push({
      category: 'screening_result',
      content: extractSection(response, /screen|sanction|match/i, 300),
      importance: 7,
    });
  }

  // Filing decisions
  if (/\b(str|sar|dpmsr|pnmr|ffr|filing|goaml)\b/.test(lower) &&
      /\b(draft|submit|create|generate|prepare)\b/.test(lower)) {
    records.push({
      category: 'filing_activity',
      content: extractSection(response, /filing|str|sar|draft/i, 300),
      importance: 8,
    });
  }

  // MLRO decisions
  if (/\bmlro\b/.test(lower) &&
      /\b(decision|directive|approve|reject|escalat)\b/.test(lower)) {
    records.push({
      category: 'mlro_directive',
      content: extractSection(response, /mlro.*(?:decision|directive|approve|reject)/i, 300),
      importance: 9,
    });
  }

  // Risk assessments
  if (/\b(risk assessment|risk rating|high risk|low risk|medium risk|edd|cdd)\b/.test(lower)) {
    records.push({
      category: 'risk_assessment',
      content: extractSection(response, /risk.*(?:assess|rating|high|low|medium)/i, 300),
      importance: 7,
    });
  }

  // Compliance decisions
  if (/\b(approved|rejected|declined|onboarded|exited|blocked|closed)\b/.test(lower) &&
      /\b(customer|entity|counterpart|account|relationship)\b/.test(lower)) {
    records.push({
      category: 'compliance_decision',
      content: extractSection(response, /(?:approved|rejected|declined|onboarded|exited|blocked)/i, 300),
      importance: 8,
    });
  }

  return records;
}

/**
 * Extract a relevant section of text around a regex match.
 */
function extractSection(text, pattern, maxLen) {
  const match = text.match(pattern);
  if (!match) return text.slice(0, maxLen);

  const idx = match.index;
  const start = Math.max(0, idx - 50);
  const end = Math.min(text.length, idx + maxLen - 50);
  let section = text.slice(start, end).replace(/\n{2,}/g, '\n').trim();

  if (start > 0) section = '...' + section;
  if (end < text.length) section = section + '...';

  return section;
}
