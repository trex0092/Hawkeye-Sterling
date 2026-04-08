#!/usr/bin/env node
/**
 * PostToolUse hook — runs after Claude Code uses a tool.
 *
 * Captures significant tool interactions as observations:
 * - File edits to compliance-critical paths
 * - Screening-related commands
 * - Filing-related operations
 *
 * Reads the tool invocation details from stdin.
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

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const toolName = payload.tool_name || payload.tool || '';
  const toolInput = payload.tool_input || payload.input || {};
  const toolResult = payload.tool_result || payload.output || '';

  // Only record significant tool uses
  const record = shouldRecord(toolName, toolInput, toolResult);
  if (!record) process.exit(0);

  // Resume session
  const existing = mem.recentSessions(1);
  if (existing.length === 0 || existing[0].ended_at) {
    mem.startSession(sessionId);
  }

  mem.observe({
    category: record.category,
    content: record.content,
    toolName,
    filePath: record.filePath,
    entityName: record.entityName,
    importance: record.importance,
  });

  console.error(`[claude-mem] Tool use recorded: ${toolName} -> ${record.category}`);
} catch (err) {
  console.error(`[claude-mem] post-tool-use error: ${err.message}`);
  process.exit(0);
} finally {
  mem.close();
}

/**
 * Determine whether a tool use should be recorded and with what metadata.
 * Returns null if the tool use is not significant.
 */
function shouldRecord(toolName, toolInput, toolResult) {
  const filePath = toolInput.file_path || toolInput.path || '';
  const command = toolInput.command || '';
  const resultStr = typeof toolResult === 'string'
    ? toolResult
    : JSON.stringify(toolResult).slice(0, 1000);

  // Screening-related operations
  if (filePath.includes('screening/') || command.includes('screen')) {
    return {
      category: 'screening_result',
      content: `Screening operation via ${toolName}: ${summarise(filePath, command, resultStr)}`,
      filePath,
      entityName: extractEntityName(toolInput, resultStr),
      importance: 7,
    };
  }

  // Filing-related edits
  if (filePath.includes('filing') || filePath.includes('history/filings')) {
    return {
      category: 'filing_activity',
      content: `Filing activity via ${toolName}: ${summarise(filePath, command, resultStr)}`,
      filePath,
      importance: 8,
    };
  }

  // Edits to regulatory context
  if (filePath.includes('regulatory-context') || filePath.includes('deadlines')) {
    return {
      category: 'regulatory_observation',
      content: `Regulatory config change via ${toolName}: ${filePath}`,
      filePath,
      importance: 8,
    };
  }

  // Edits to entity/counterparty data
  if (filePath.includes('entities') || filePath.includes('counterpart') || filePath.includes('register')) {
    return {
      category: 'entity_interaction',
      content: `Entity data change via ${toolName}: ${filePath}`,
      filePath,
      entityName: extractEntityName(toolInput, resultStr),
      importance: 6,
    };
  }

  // Script modifications
  if (filePath.includes('scripts/') && toolName === 'Edit') {
    return {
      category: 'architecture_change',
      content: `Script modified: ${filePath}`,
      filePath,
      importance: 5,
    };
  }

  // Bash commands that look compliance-relevant
  if (toolName === 'Bash' && command) {
    if (/screen|sanction|filing|mlro|compliance|goaml/.test(command.toLowerCase())) {
      return {
        category: 'workflow_note',
        content: `Compliance command: ${command.slice(0, 300)}`,
        importance: 6,
      };
    }
  }

  // Error resolutions (tool result contains error patterns that were resolved)
  if (resultStr.includes('Error') || resultStr.includes('error')) {
    if (toolName === 'Edit' || toolName === 'Bash') {
      return {
        category: 'error_resolution',
        content: `Error encountered in ${toolName}: ${resultStr.slice(0, 200)}`,
        filePath,
        importance: 5,
      };
    }
  }

  return null;
}

function summarise(filePath, command, result) {
  const parts = [];
  if (filePath) parts.push(filePath);
  if (command) parts.push(command.slice(0, 100));
  if (result && result.length < 200) parts.push(result);
  return parts.join(' | ') || 'no details';
}

function extractEntityName(input, result) {
  // Try to find entity names in the tool input or result
  const combined = JSON.stringify(input) + (result || '');
  const match = combined.match(/(?:entity|counterpart|customer|name)['":\s]+([A-Z][A-Za-z\s&.-]{2,40})/);
  return match ? match[1].trim() : null;
}
