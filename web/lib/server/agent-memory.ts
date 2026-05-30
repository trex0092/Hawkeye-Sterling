// Agent memory abstraction — unified read/write interface across 11 memory backends.
//
// Backend priority (first env var that is set wins):
//   1. Supermemory  (SUPERMEMORY_API_KEY)        — supermemoryai/supermemory
//   2. Mem0         (MEM0_API_KEY)                — mem0ai/mem0
//   3. Honcho       (HONCHO_URL + HONCHO_APP_ID)  — plastic-labs/honcho
//   4. MemOS        (MEMOS_URL)                   — MemTensor/MemOS
//   5. EverOS       (EVEROS_URL)                  — EverMind-AI/EverOS
//   6. Octopoda-OS  (OCTOPODA_URL)                — RyjoxTechnologies/Octopoda-OS
//   7. Netlify Blobs fallback — always available, no external dep
//
// The interface is deliberately simple: add / search / getAll / delete.
// All callers use AgentMemory without knowing which backend is active.
//
// Usage in MLRO advisor route:
//   const mem = getAgentMemory();
//   const past = await mem.search(subjectName, 5);
//   // ... run analysis ...
//   await mem.add(result, { subjectName, riskScore, at: new Date().toISOString() });

import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  score?: number; // relevance score when returned from search
}

export interface AgentMemory {
  add(_content: string, _metadata?: Record<string, unknown>): Promise<string>;
  search(_query: string, _limit?: number): Promise<MemoryEntry[]>;
  getAll(_limit?: number): Promise<MemoryEntry[]>;
  delete(_id: string): Promise<void>;
  readonly backend: string;
}

// ── Supermemory backend ──────────────────────────────────────────────────────
// https://github.com/supermemoryai/supermemory (22 830 ⭐, TypeScript)
// REST API: POST /v1/memories, GET /v1/search?q=, GET /v1/memories, DELETE /v1/memories/{id}

class SupermemoryBackend implements AgentMemory {
  readonly backend = "supermemory";
  private base: string;
  private headers: Record<string, string>;

  constructor(apiKey: string) {
    this.base = "https://api.supermemory.ai";
    this.headers = {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    };
  }

  async add(content: string, metadata: Record<string, unknown> = {}): Promise<string> {
    const res = await fetch(`${this.base}/v1/memories`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ content, metadata }),
    });
    if (!res.ok) throw new Error(`Supermemory add failed: ${res.status}`);
    const data = await res.json() as { id?: string };
    return data.id ?? randomBytes(8).toString("hex");
  }

  async search(query: string, limit = 5): Promise<MemoryEntry[]> {
    const url = `${this.base}/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<{ id: string; content: string; metadata?: Record<string, unknown>; score?: number; createdAt?: string }> };
    return (data.results ?? []).map((r) => ({
      id: r.id,
      content: r.content,
      metadata: r.metadata ?? {},
      createdAt: r.createdAt ?? new Date().toISOString(),
      score: r.score,
    }));
  }

  async getAll(limit = 50): Promise<MemoryEntry[]> {
    const res = await fetch(`${this.base}/v1/memories?limit=${limit}`, { headers: this.headers });
    if (!res.ok) return [];
    const data = await res.json() as { memories?: Array<{ id: string; content: string; metadata?: Record<string, unknown>; createdAt?: string }> };
    return (data.memories ?? []).map((m) => ({
      id: m.id,
      content: m.content,
      metadata: m.metadata ?? {},
      createdAt: m.createdAt ?? new Date().toISOString(),
    }));
  }

  async delete(id: string): Promise<void> {
    await fetch(`${this.base}/v1/memories/${id}`, { method: "DELETE", headers: this.headers });
  }
}

// ── Mem0 backend ─────────────────────────────────────────────────────────────
// https://github.com/mem0ai/mem0 (57 134 ⭐, Python + JS SDK)
// REST API: POST /memories, POST /memories/search, GET /memories, DELETE /memories/{id}

class Mem0Backend implements AgentMemory {
  readonly backend = "mem0";
  private base: string;
  private headers: Record<string, string>;

  constructor(apiKey: string, baseUrl = "https://api.mem0.ai") {
    this.base = baseUrl;
    this.headers = {
      "authorization": `Token ${apiKey}`,
      "content-type": "application/json",
    };
  }

  async add(content: string, metadata: Record<string, unknown> = {}): Promise<string> {
    const res = await fetch(`${this.base}/memories/`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        messages: [{ role: "user", content }],
        metadata,
        agent_id: "hawkeye-sterling",
      }),
    });
    if (!res.ok) throw new Error(`Mem0 add failed: ${res.status}`);
    const data = await res.json() as { id?: string } | Array<{ id?: string }>;
    if (Array.isArray(data)) return data[0]?.id ?? randomBytes(8).toString("hex");
    return (data as { id?: string }).id ?? randomBytes(8).toString("hex");
  }

  async search(query: string, limit = 5): Promise<MemoryEntry[]> {
    const res = await fetch(`${this.base}/memories/search/`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ query, agent_id: "hawkeye-sterling", limit }),
    });
    if (!res.ok) return [];
    const data = await res.json() as Array<{ id: string; memory: string; metadata?: Record<string, unknown>; score?: number; created_at?: string }>;
    return (Array.isArray(data) ? data : []).map((m) => ({
      id: m.id,
      content: m.memory,
      metadata: m.metadata ?? {},
      createdAt: m.created_at ?? new Date().toISOString(),
      score: m.score,
    }));
  }

  async getAll(limit = 50): Promise<MemoryEntry[]> {
    const res = await fetch(`${this.base}/memories/?agent_id=hawkeye-sterling&limit=${limit}`, { headers: this.headers });
    if (!res.ok) return [];
    const data = await res.json() as Array<{ id: string; memory: string; metadata?: Record<string, unknown>; created_at?: string }>;
    return (Array.isArray(data) ? data : []).map((m) => ({
      id: m.id,
      content: m.memory,
      metadata: m.metadata ?? {},
      createdAt: m.created_at ?? new Date().toISOString(),
    }));
  }

  async delete(id: string): Promise<void> {
    await fetch(`${this.base}/memories/${id}/`, { method: "DELETE", headers: this.headers });
  }
}

// ── Honcho backend ────────────────────────────────────────────────────────────
// https://github.com/plastic-labs/honcho (4 506 ⭐, Python + TypeScript SDK)
// Stateful agent memory — uses metamessages for long-term storage.

class HonchoBackend implements AgentMemory {
  readonly backend = "honcho";
  private base: string;
  private appId: string;
  private userId = "hawkeye-mlro";
  private sessionId = "default";
  private headers: Record<string, string>;

  constructor(baseUrl: string, appId: string, apiKey?: string) {
    this.base = baseUrl.replace(/\/$/, "");
    this.appId = appId;
    this.headers = {
      "content-type": "application/json",
      ...(apiKey ? { "authorization": `Bearer ${apiKey}` } : {}),
    };
  }

  private prefix() {
    return `${this.base}/apps/${this.appId}/users/${this.userId}/sessions/${this.sessionId}`;
  }

  async add(content: string, metadata: Record<string, unknown> = {}): Promise<string> {
    const res = await fetch(`${this.prefix()}/metamessages`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ content, metadata, is_user: false }),
    });
    if (!res.ok) throw new Error(`Honcho add failed: ${res.status}`);
    const data = await res.json() as { id?: string };
    return data.id ?? randomBytes(8).toString("hex");
  }

  async search(query: string, limit = 5): Promise<MemoryEntry[]> {
    // Honcho uses semantic search via /query endpoint
    const res = await fetch(`${this.prefix()}/metamessages/query`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ query, top_k: limit }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { metamessages?: Array<{ id: string; content: string; metadata?: Record<string, unknown>; created_at?: string }> };
    return (data.metamessages ?? []).map((m) => ({
      id: m.id,
      content: m.content,
      metadata: m.metadata ?? {},
      createdAt: m.created_at ?? new Date().toISOString(),
    }));
  }

  async getAll(limit = 50): Promise<MemoryEntry[]> {
    const res = await fetch(`${this.prefix()}/metamessages?page=1&page_size=${limit}`, { headers: this.headers });
    if (!res.ok) return [];
    const data = await res.json() as { items?: Array<{ id: string; content: string; metadata?: Record<string, unknown>; created_at?: string }> };
    return (data.items ?? []).map((m) => ({
      id: m.id, content: m.content, metadata: m.metadata ?? {}, createdAt: m.created_at ?? new Date().toISOString(),
    }));
  }

  async delete(id: string): Promise<void> {
    await fetch(`${this.prefix()}/metamessages/${id}`, { method: "DELETE", headers: this.headers });
  }
}

// ── Generic OpenAPI-compatible backend ───────────────────────────────────────
// Covers: MemOS (MemTensor/MemOS), EverOS (EverMind-AI/EverOS),
//         Octopoda-OS (RyjoxTechnologies/Octopoda-OS), magic-context
// All expose a compatible REST API on their configured port.

class GenericRestBackend implements AgentMemory {
  readonly backend: string;
  private base: string;
  private headers: Record<string, string>;

  constructor(name: string, baseUrl: string, apiKey?: string) {
    this.backend = name;
    this.base = baseUrl.replace(/\/$/, "");
    this.headers = {
      "content-type": "application/json",
      ...(apiKey ? { "authorization": `Bearer ${apiKey}` } : {}),
    };
  }

  async add(content: string, metadata: Record<string, unknown> = {}): Promise<string> {
    const res = await fetch(`${this.base}/memories`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ content, metadata }),
    });
    if (!res.ok) throw new Error(`${this.backend} add failed: ${res.status}`);
    const data = await res.json() as { id?: string };
    return data.id ?? randomBytes(8).toString("hex");
  }

  async search(query: string, limit = 5): Promise<MemoryEntry[]> {
    const res = await fetch(`${this.base}/memories/search`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<{ id: string; content: string; metadata?: Record<string, unknown>; score?: number; created_at?: string }> };
    return (data.results ?? []).map((r) => ({
      id: r.id, content: r.content, metadata: r.metadata ?? {},
      createdAt: r.created_at ?? new Date().toISOString(), score: r.score,
    }));
  }

  async getAll(limit = 50): Promise<MemoryEntry[]> {
    const res = await fetch(`${this.base}/memories?limit=${limit}`, { headers: this.headers });
    if (!res.ok) return [];
    const data = await res.json() as Array<{ id: string; content: string; metadata?: Record<string, unknown>; created_at?: string }>;
    return (Array.isArray(data) ? data : []).map((m) => ({
      id: m.id, content: m.content, metadata: m.metadata ?? {}, createdAt: m.created_at ?? new Date().toISOString(),
    }));
  }

  async delete(id: string): Promise<void> {
    await fetch(`${this.base}/memories/${id}`, { method: "DELETE", headers: this.headers });
  }
}

// ── Netlify Blobs fallback ────────────────────────────────────────────────────
// Always available — no external service dependency.
// Uses hawkeye-agent-memory Blob store; key format: memories/{id}.json

const MEMORY_STORE = "hawkeye-agent-memory";
const MEMORY_MAX = 1000;

class BlobsBackend implements AgentMemory {
  readonly backend = "netlify-blobs";

  async add(content: string, metadata: Record<string, unknown> = {}): Promise<string> {
    const id = `${Date.now()}_${randomBytes(6).toString("hex")}`;
    const entry: MemoryEntry = { id, content, metadata, createdAt: new Date().toISOString() };
    try {
      const store = getStore(MEMORY_STORE);
      await store.set(`memories/${id}.json`, JSON.stringify(entry));
      // Prune if over limit — best effort, don't block
      void store.list({ prefix: "memories/" }).then(async ({ blobs }) => {
        if (blobs.length > MEMORY_MAX) {
          const oldest = blobs.sort((a, b) => a.key.localeCompare(b.key)).slice(0, blobs.length - MEMORY_MAX);
          await Promise.all(oldest.map((b) => store.delete(b.key).catch(() => {})));
        }
      }).catch(() => {});
    } catch (err) {
      console.warn("[agent-memory/blobs] add failed:", err instanceof Error ? err.message : String(err));
    }
    return id;
  }

  async search(query: string, limit = 5): Promise<MemoryEntry[]> {
    // Blobs has no vector search — do keyword scan over recent entries
    try {
      const all = await this.getAll(200);
      const q = query.toLowerCase();
      const scored = all
        .map((e) => ({
          ...e,
          score: (e.content.toLowerCase().split(q).length - 1) +
                 (JSON.stringify(e.metadata).toLowerCase().split(q).length - 1),
        }))
        .filter((e) => e.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return scored;
    } catch {
      return [];
    }
  }

  async getAll(limit = 50): Promise<MemoryEntry[]> {
    try {
      const store = getStore(MEMORY_STORE);
      const { blobs } = await store.list({ prefix: "memories/" });
      const recent = blobs
        .sort((a, b) => b.key.localeCompare(a.key))
        .slice(0, limit);
      const entries = await Promise.all(
        recent.map(async (b) => {
          try {
            const raw = await store.get(b.key, { type: "text" });
            return raw ? (JSON.parse(raw) as MemoryEntry) : null;
          } catch { return null; }
        }),
      );
      return entries.filter((e): e is MemoryEntry => e !== null);
    } catch {
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const store = getStore(MEMORY_STORE);
      await store.delete(`memories/${id}.json`);
    } catch { /* best-effort */ }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────
// Returns the highest-priority backend for which credentials are configured.
// Singleton per process — re-creating the client on every request wastes the
// HTTP keep-alive connection pool the REST backends maintain.

let _instance: AgentMemory | null = null;

export function getAgentMemory(): AgentMemory {
  if (_instance) return _instance;

  const supermemoryKey = process.env["SUPERMEMORY_API_KEY"];
  if (supermemoryKey) {
    _instance = new SupermemoryBackend(supermemoryKey);
    return _instance;
  }

  const mem0Key = process.env["MEM0_API_KEY"];
  if (mem0Key) {
    const mem0Base = process.env["MEM0_BASE_URL"]; // optional for self-hosted
    _instance = new Mem0Backend(mem0Key, mem0Base);
    return _instance;
  }

  const honchoUrl = process.env["HONCHO_URL"];
  const honchoApp = process.env["HONCHO_APP_ID"];
  if (honchoUrl && honchoApp) {
    _instance = new HonchoBackend(honchoUrl, honchoApp, process.env["HONCHO_API_KEY"]);
    return _instance;
  }

  const memosUrl = process.env["MEMOS_URL"];
  if (memosUrl) {
    _instance = new GenericRestBackend("memos", memosUrl, process.env["MEMOS_API_KEY"]);
    return _instance;
  }

  const everosUrl = process.env["EVEROS_URL"];
  if (everosUrl) {
    _instance = new GenericRestBackend("everos", everosUrl, process.env["EVEROS_API_KEY"]);
    return _instance;
  }

  const octopodaUrl = process.env["OCTOPODA_URL"];
  if (octopodaUrl) {
    _instance = new GenericRestBackend("octopoda", octopodaUrl, process.env["OCTOPODA_API_KEY"]);
    return _instance;
  }

  _instance = new BlobsBackend();
  return _instance;
}

// Exported for testing — resets the singleton so tests can inject their own env
export function _resetAgentMemory(): void {
  _instance = null;
}
