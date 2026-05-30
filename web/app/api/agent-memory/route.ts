// POST /api/agent-memory
// Unified agent memory read/write endpoint.
//
// Backed by the priority chain in agent-memory.ts:
//   Supermemory → Mem0 → Honcho → MemOS → EverOS → Octopoda → Netlify Blobs
//
// Actions:
//   add    — store a new memory entry
//   search — semantic/keyword search over memories
//   list   — most recent N memories
//   delete — remove a memory by id

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAgentMemory } from "@/lib/server/agent-memory";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface Body {
  action: "add" | "search" | "list" | "delete";
  content?: string;
  query?: string;
  limit?: number;
  id?: string;
  metadata?: Record<string, unknown>;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  const mem = getAgentMemory();

  switch (body.action) {
    case "add": {
      if (!body.content?.trim()) {
        return NextResponse.json({ ok: false, error: "content is required for add" }, { status: 400, headers: gate.headers });
      }
      const id = await mem.add(body.content, { ...body.metadata, tenantId: tenant, actor: gate.keyId });
      void writeAuditChainEntry({ event: "agent_memory.add", actor: gate.keyId, memoryId: id, backend: mem.backend }, tenant).catch(() => {});
      return NextResponse.json({ ok: true, id, backend: mem.backend }, { headers: gate.headers });
    }

    case "search": {
      const query = body.query?.trim() ?? "";
      if (!query) {
        return NextResponse.json({ ok: false, error: "query is required for search" }, { status: 400, headers: gate.headers });
      }
      const results = await mem.search(query, body.limit ?? 5);
      return NextResponse.json({ ok: true, results, total: results.length, backend: mem.backend }, { headers: gate.headers });
    }

    case "list": {
      const results = await mem.getAll(body.limit ?? 20);
      return NextResponse.json({ ok: true, results, total: results.length, backend: mem.backend }, { headers: gate.headers });
    }

    case "delete": {
      if (!body.id) {
        return NextResponse.json({ ok: false, error: "id is required for delete" }, { status: 400, headers: gate.headers });
      }
      await mem.delete(body.id);
      void writeAuditChainEntry({ event: "agent_memory.delete", actor: gate.keyId, memoryId: body.id, backend: mem.backend }, tenant).catch(() => {});
      return NextResponse.json({ ok: true, deleted: body.id, backend: mem.backend }, { headers: gate.headers });
    }

    default:
      return NextResponse.json({ ok: false, error: "action must be add|search|list|delete" }, { status: 400, headers: gate.headers });
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const mem = getAgentMemory();
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const results = await mem.getAll(limit);
  return NextResponse.json({ ok: true, results, total: results.length, backend: mem.backend }, { headers: gate.headers });
}
