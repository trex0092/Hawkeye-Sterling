// Map known Claude-Console managed-agent error messages to operator-actionable
// hints. The Claude Console emits cryptic platform-side errors (MCP credential
// gaps, agent-not-found, environment-misconfig) that are useless to an MLRO —
// they describe Anthropic-side state, not what the user must do to recover.
//
// Each pattern below is matched case-insensitively against the raw error
// message returned via a `session.error` event from beta.sessions. A match
// returns a structured hint the UI can render below the raw error so the
// operator knows exactly which dashboard / vault / config to touch.
//
// Adding a new pattern: keep the regex anchored to a specific Anthropic
// phrase ("no credential is stored", "agent not found"), keep the hint
// imperative ("Open ... → ... → ..."), and add a unit test in the suite.

export interface AgentErrorHint {
  /** Short, operator-readable category for grouping / metrics. */
  category:
    | "mcp_credential_missing"
    | "agent_not_found"
    | "environment_misconfig"
    | "rate_limited"
    | "session_terminated"
    | "unknown";
  /** Multi-line actionable guidance shown to the operator. */
  hint: string;
}

interface ErrorPattern {
  match: RegExp;
  describe: (_raw: string) => AgentErrorHint;
}

const PATTERNS: ErrorPattern[] = [
  {
    // Anthropic phrasing: "MCP server '<name>' initialize failed: no
    // credential is stored for this server URL — check that the agent's
    // MCP server URL matches the URL in the vault"
    match: /no credential is stored.*server url/i,
    describe: (raw) => {
      const serverMatch = raw.match(/MCP server\s+['"]?([\w-]+)['"]?/i);
      const serverName = serverMatch?.[1] ?? "the MCP server";
      return {
        category: "mcp_credential_missing",
        hint: [
          `The credential for ${serverName} exists in the vault but is not linked to the agent's MCP server entry.`,
          ``,
          `Fix (30 seconds in the Console):`,
          `  1. Go to console.anthropic.com → Agents → Data Analyst → Edit`,
          `  2. Click the "${serverName}" MCP server row`,
          `  3. In the "Credential" dropdown, select "Data Analyst Vault"`,
          `  4. Confirm URL is exactly: https://mcp.${serverName}.com/mcp (no trailing slash)`,
          `  5. Click Save — retry immediately after`,
        ].join("\n"),
      };
    },
  },
  {
    match: /MCP server.*initialize failed/i,
    describe: (raw) => {
      const serverMatch = raw.match(/MCP server\s+['"]?([\w-]+)['"]?/i);
      const serverName = serverMatch?.[1] ?? "an MCP server";
      return {
        category: "mcp_credential_missing",
        hint: [
          `${serverName} failed to initialise for the Data Analyst agent.`,
          ``,
          `Most likely causes:`,
          `  · The MCP server is unreachable (firewall, DNS, or outage on the provider side)`,
          `  · The vault credential has expired or been rotated`,
          `  · The agent's configured MCP server URL no longer matches the vault entry`,
          ``,
          `Resolution: open the Data Analyst agent in https://console.anthropic.com, inspect the MCP servers panel, and verify both connectivity and credential validity. Retry after fixing.`,
        ].join("\n"),
      };
    },
  },
  {
    // Match in either word-order: "agent not found" or "unknown agent".
    match: /(?:agent\s+(?:not\s+found|does\s+not\s+exist|unknown)|unknown\s+agent)/i,
    describe: () => ({
      category: "agent_not_found",
      hint: [
        `The configured Data Analyst agent ID is not recognised by the Claude Console.`,
        ``,
        `Resolution:`,
        `  · Check AGENT_ID and ENV_ID in web/app/api/agent/data-analyst/route.ts`,
        `  · Confirm the agent exists in https://console.anthropic.com → Agents and has not been archived`,
        `  · If the agent was rebuilt, update both AGENT_ID and ENV_ID to the new identifiers and redeploy`,
      ].join("\n"),
    }),
  },
  {
    // Match in either word-order: "environment not found / invalid" or
    // "invalid environment". Restricted to nearby phrasing (\s*) so generic
    // "invalid" messages don't get classified as env errors.
    match: /(?:environment\s+(?:not\s+found|does\s+not\s+exist|invalid)|invalid\s+environment)/i,
    describe: () => ({
      category: "environment_misconfig",
      hint: [
        `The Data Analyst agent's environment ID is not recognised.`,
        ``,
        `Resolution: open the agent in https://console.anthropic.com, copy the current environment ID from the configuration panel, and update ENV_ID in web/app/api/agent/data-analyst/route.ts. A common cause is a typo (e.g. "1" vs "i") in the env ID literal.`,
      ].join("\n"),
    }),
  },
  {
    match: /rate\s*limit|429|too many requests/i,
    describe: () => ({
      category: "rate_limited",
      hint: [
        `The Anthropic API rate-limited this request.`,
        ``,
        `Wait 30–60 seconds and retry. If the failure persists, check the workspace's usage quota in https://console.anthropic.com → Usage. Consider raising the per-org rate limit or routing through a separate workspace for Data Analyst calls.`,
      ].join("\n"),
    }),
  },
];

/** Translate a raw session-error message from the Claude Console into a
 *  structured operator hint. Returns null when no pattern matches — the
 *  caller should surface the raw message as-is. */
export function describeAgentError(rawMessage: string): AgentErrorHint | null {
  for (const p of PATTERNS) {
    if (p.match.test(rawMessage)) {
      return p.describe(rawMessage);
    }
  }
  return null;
}
