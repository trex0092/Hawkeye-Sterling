import { describe, it, expect } from 'vitest';
import { describeAgentError } from '../agent-error-hints';

describe('describeAgentError — MCP credential missing', () => {
  it('matches the literal Anthropic phrasing observed in production', () => {
    const raw = "MCP server 'amplitude' initialize failed: no credential is stored for this server URL — check that the agent's MCP server URL matches the URL in the vault";
    const out = describeAgentError(raw);
    expect(out).not.toBeNull();
    expect(out?.category).toBe('mcp_credential_missing');
    expect(out?.hint).toContain('amplitude');
    expect(out?.hint).toContain('console.anthropic.com');
    expect(out?.hint).toContain('vault');
  });

  it('extracts the MCP server name from double-quoted form', () => {
    const raw = 'MCP server "linear" initialize failed: no credential is stored for this server URL';
    const out = describeAgentError(raw);
    expect(out?.hint).toContain('linear');
  });

  it('falls back to a generic name when extraction fails', () => {
    const raw = 'no credential is stored for this server url at all';
    const out = describeAgentError(raw);
    expect(out?.category).toBe('mcp_credential_missing');
    expect(out?.hint).toContain('the MCP server');
  });

  it('matches the generic MCP-init-failed branch when no credential phrasing is present', () => {
    const raw = "MCP server 'github' initialize failed: connection timed out after 10s";
    const out = describeAgentError(raw);
    expect(out).not.toBeNull();
    expect(out?.category).toBe('mcp_credential_missing');
    expect(out?.hint).toContain('github');
    expect(out?.hint).toContain('unreachable');
  });
});

describe('describeAgentError — agent / environment misconfig', () => {
  it('matches "agent not found"', () => {
    const out = describeAgentError('agent not found for given identifier');
    expect(out?.category).toBe('agent_not_found');
    expect(out?.hint).toContain('AGENT_ID');
    expect(out?.hint).toContain('ENV_ID');
  });

  it('matches "agent does not exist"', () => {
    expect(describeAgentError('the agent does not exist in this workspace')?.category).toBe('agent_not_found');
  });

  it('matches "unknown agent"', () => {
    expect(describeAgentError('unknown agent ID supplied')?.category).toBe('agent_not_found');
  });

  it('matches environment-not-found', () => {
    const out = describeAgentError('environment not found: env_01ABC');
    expect(out?.category).toBe('environment_misconfig');
    expect(out?.hint).toContain('ENV_ID');
    expect(out?.hint).toContain('typo');
  });

  it('matches invalid-environment', () => {
    expect(describeAgentError('invalid environment for this agent')?.category).toBe('environment_misconfig');
  });
});

describe('describeAgentError — rate limit', () => {
  it('matches explicit "rate limit"', () => {
    const out = describeAgentError('rate limit exceeded');
    expect(out?.category).toBe('rate_limited');
    expect(out?.hint).toMatch(/30–?60 seconds/);
  });

  it('matches "429"', () => {
    expect(describeAgentError('429 returned by upstream')?.category).toBe('rate_limited');
  });

  it('matches "too many requests"', () => {
    expect(describeAgentError('Too many requests')?.category).toBe('rate_limited');
  });
});

describe('describeAgentError — unmatched', () => {
  it('returns null for unrecognised errors', () => {
    expect(describeAgentError('some completely unexpected error from the model')).toBeNull();
    expect(describeAgentError('')).toBeNull();
    expect(describeAgentError('internal server error')).toBeNull();
  });
});
