#!/usr/bin/env node
/**
 * PostToolUse hook for Compliance Analyzer.
 * Records significant tool interactions: edits to domain constants,
 * compliance suite, regulatory monitor, goAML, thresholds, and services.
 */

import mem from '../index.mjs';

const sessionId = process.env.CLAUDE_SESSION_ID
  || `session-${Date.now().toString(36)}`;

try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = Buffer.concat(chunks).toString('utf8').trim();
  if (!input) process.exit(0);

  let payload;
  try { payload = JSON.parse(input); } catch { process.exit(0); }

  const toolName = payload.tool_name || payload.tool || '';
  const toolInput = payload.tool_input || payload.input || {};
  const toolResult = payload.tool_result || payload.output || '';

  const record = shouldRecord(toolName, toolInput, toolResult);
  if (!record) process.exit(0);

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

function shouldRecord(toolName, toolInput, toolResult) {
  const filePath = toolInput.file_path || toolInput.path || '';
  const command = toolInput.command || '';
  const resultStr = typeof toolResult === 'string'
    ? toolResult : JSON.stringify(toolResult).slice(0, 1000);

  // Domain constants (single source of truth)
  if (filePath.includes('domain/constants')) {
    return {
      category: 'regulatory_observation',
      content: `Constants updated via ${toolName}: ${filePath}`,
      filePath, importance: 9,
    };
  }

  // Compliance suite
  if (filePath.includes('compliance-suite') || filePath.includes('compliance_suite')) {
    return {
      category: 'compliance_decision',
      content: `Compliance suite modified via ${toolName}: ${filePath}`,
      filePath, importance: 8,
    };
  }

  // goAML export
  if (filePath.includes('goaml') || filePath.includes('filing')) {
    return {
      category: 'filing_activity',
      content: `goAML/filing change via ${toolName}: ${filePath}`,
      filePath, importance: 8,
    };
  }

  // Threshold monitor
  if (filePath.includes('threshold') || filePath.includes('monitor')) {
    return {
      category: 'threshold_alert',
      content: `Threshold/monitor change via ${toolName}: ${filePath}`,
      filePath, importance: 7,
    };
  }

  // Regulatory monitor
  if (filePath.includes('regulatory')) {
    return {
      category: 'regulatory_observation',
      content: `Regulatory monitor change via ${toolName}: ${filePath}`,
      filePath, importance: 7,
    };
  }

  // Supply chain
  if (filePath.includes('supply-chain') || filePath.includes('supply_chain')) {
    return {
      category: 'supply_chain_event',
      content: `Supply chain module change via ${toolName}: ${filePath}`,
      filePath, importance: 6,
    };
  }

  // Risk assessment
  if (filePath.includes('risk/')) {
    return {
      category: 'risk_assessment',
      content: `Risk module change via ${toolName}: ${filePath}`,
      filePath, importance: 7,
    };
  }

  // Auth / RBAC
  if (filePath.includes('auth') || filePath.includes('rbac')) {
    return {
      category: 'architecture_change',
      content: `Auth/RBAC change via ${toolName}: ${filePath}`,
      filePath, importance: 7,
    };
  }

  // Management approvals
  if (filePath.includes('approval') || filePath.includes('management')) {
    return {
      category: 'compliance_decision',
      content: `Approval workflow change via ${toolName}: ${filePath}`,
      filePath, importance: 6,
    };
  }

  // Services layer
  if (filePath.includes('services/')) {
    return {
      category: 'architecture_change',
      content: `Service modified: ${filePath}`,
      filePath, importance: 5,
    };
  }

  // Compliance-relevant bash commands
  if (toolName === 'Bash' && command) {
    if (/screen|sanction|filing|compliance|goaml|threshold/.test(command.toLowerCase())) {
      return {
        category: 'workflow_note',
        content: `Compliance command: ${command.slice(0, 300)}`,
        importance: 6,
      };
    }
  }

  // Error resolutions
  if (resultStr.includes('Error') || resultStr.includes('error')) {
    if (toolName === 'Edit' || toolName === 'Bash') {
      return {
        category: 'error_resolution',
        content: `Error encountered in ${toolName}: ${resultStr.slice(0, 200)}`,
        filePath, importance: 5,
      };
    }
  }

  return null;
}
