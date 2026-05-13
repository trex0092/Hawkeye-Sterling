// MCP Agent Registry (Controls 1.01/1.05)
// Extends the tool manifest into a full versioned registry stored in Netlify Blobs.
// Each entry records: version, owner, approvedAt, expiresAt, riskRating, status.
// Registry can be read via GET /api/operator/registry.

import { TOOL_MANIFEST } from "./tool-manifest";
import type { ConsequenceLevel } from "./tool-manifest";

export type RegistryStatus = "active" | "deprecated" | "suspended";

export interface RegistryEntry {
  toolName: string;
  version: string;
  owner: string;
  consequenceLevel: ConsequenceLevel;
  description: string;
  regulatoryNote?: string;
  riskRating: "critical" | "high" | "medium" | "low";
  status: RegistryStatus;
  approvedAt: string;
  expiresAt: string;
  lastReviewedAt: string;
  changeLog: Array<{ version: string; date: string; summary: string }>;
}

export interface AgentRegistry {
  version: string;
  generatedAt: string;
  tools: RegistryEntry[];
}

// Risk rating derived from consequence level
function riskRating(level: ConsequenceLevel, toolName: string): RegistryEntry["riskRating"] {
  if (level === "action") return "critical";
  if (level === "supervised") {
    if (["generate_sar_report", "disposition", "screen"].includes(toolName)) return "high";
    return "medium";
  }
  return "low";
}

// Owner assigned by tool category
function toolOwner(toolName: string): string {
  if (["generate_sar_report", "generate_report", "mlro_analyze", "disposition"].includes(toolName)) {
    return "MLRO / Compliance Officer";
  }
  if (["call_api"].includes(toolName)) return "CTO / System Administrator";
  if (["system_status", "audit_trail"].includes(toolName)) return "Compliance Officer / IT";
  return "Compliance Officer";
}

// Build the static registry from the tool manifest
export function buildRegistry(): AgentRegistry {
  const now = new Date().toISOString();
  // Expiry: 12 months from approval (annual review cycle — ISO 42001 Clause 9.1)
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString();
  const approvedAt = "2026-05-11T00:00:00.000Z"; // initial deployment approval date

  const tools: RegistryEntry[] = Object.entries(TOOL_MANIFEST).map(([toolName, entry]) => ({
    toolName,
    version: "1.0.0",
    owner: toolOwner(toolName),
    consequenceLevel: entry.level,
    description: entry.description,
    regulatoryNote: entry.regulatoryNote,
    riskRating: riskRating(entry.level, toolName),
    status: "active" as const,
    approvedAt,
    expiresAt,
    lastReviewedAt: approvedAt,
    changeLog: [
      { version: "1.0.0", date: approvedAt, summary: "Initial deployment — Hawkeye Sterling V2" },
    ],
  }));

  return { version: "1.0.0", generatedAt: now, tools };
}

// Persist registry snapshot to Netlify Blobs (call on deploy / admin request).
export async function persistRegistry(registry: AgentRegistry): Promise<void> {
  try {
    const mod = await import("@netlify/blobs").catch(() => null);
    if (!mod) return;
    const store = mod.getStore({ name: "mcp-agent-registry" });
    await store.setJSON("registry/manifest.json", registry);
  } catch (err) { console.warn("[agent-registry] persistRegistry failed:", err instanceof Error ? err.message : err); }
}

// Read registry from Netlify Blobs; fall back to built-in static registry.
export async function loadRegistry(): Promise<AgentRegistry> {
  try {
    const mod = await import("@netlify/blobs").catch(() => null);
    if (mod) {
      const store = mod.getStore({ name: "mcp-agent-registry" });
      const stored = await store.get("registry/manifest.json", { type: "json" }).catch(() => null) as AgentRegistry | null;
      if (stored && Array.isArray(stored.tools)) return stored;
    }
  } catch (err) { console.warn("[agent-registry] loadRegistry from Blobs failed, using built-in:", err instanceof Error ? err.message : err); }
  return buildRegistry();
}
