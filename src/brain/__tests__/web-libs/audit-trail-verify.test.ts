// Unit tests for the FNV-1a hash and chain-integrity-walk logic used by
// GET /api/audit-trail/verify.
//
// The pure functions (fnv1a, computeEntryHash, verifyChain) are not exported
// from the Next.js route handler, so they are re-implemented here verbatim
// and tested independently. Any divergence from the source would cause the
// integration tests to catch mismatches.

import { describe, it, expect } from "vitest";

// ─── Re-implementations of pure functions from audit-trail/verify/route.ts ──

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function computeEntryHash(
  prevHash: string | undefined,
  payload: unknown,
  at: string,
  seq: number,
): string {
  return fnv1a(`${prevHash ?? ""}::${seq}::${at}::${JSON.stringify(payload)}`);
}

interface ChainEntry {
  seq: number;
  prevHash?: string;
  entryHash: string;
  payload: unknown;
  at: string;
}

function verifyChain(chain: ChainEntry[]): {
  intact: boolean;
  firstBreakAt: number | null;
} {
  const sorted = [...chain].sort((a, b) => a.seq - b.seq);
  let broken = false;
  let firstBreakAt: number | null = null;
  let prevEntryHash: string | undefined = undefined;

  for (const entry of sorted) {
    const expected = computeEntryHash(entry.prevHash, entry.payload, entry.at, entry.seq);
    const hashMismatch = expected !== entry.entryHash;
    const prevLinkBroken = entry.prevHash !== prevEntryHash;

    if ((hashMismatch || prevLinkBroken) && !broken) {
      broken = true;
      firstBreakAt = entry.seq;
    }

    prevEntryHash = entry.entryHash;
  }

  return { intact: !broken, firstBreakAt };
}

function buildChain(
  events: Array<{ payload: unknown; at: string }>,
): ChainEntry[] {
  const entries: ChainEntry[] = [];
  let prevHash: string | undefined = undefined;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    const seq = i + 1;
    const entryHash = computeEntryHash(prevHash, ev.payload, ev.at, seq);
    entries.push({ seq, prevHash, entryHash, payload: ev.payload, at: ev.at });
    prevHash = entryHash;
  }
  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("fnv1a", () => {
  it("produces an 8-character lowercase hex string", () => {
    expect(fnv1a("hello")).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a("")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic — same input always yields same hash", () => {
    expect(fnv1a("test")).toBe(fnv1a("test"));
    expect(fnv1a("CASE-20260517-a3f9")).toBe(fnv1a("CASE-20260517-a3f9"));
  });

  it("empty string produces known FNV-1a offset basis 0x811c9dc5", () => {
    // FNV-1a of "" is the offset basis itself: 2166136261 = 0x811c9dc5
    expect(fnv1a("")).toBe("811c9dc5");
  });

  it("produces different hashes for different inputs", () => {
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
    expect(fnv1a("hello")).not.toBe(fnv1a("world"));
    expect(fnv1a("abc")).not.toBe(fnv1a("cba"));
  });

  it("is order-sensitive — reversed string produces different hash", () => {
    expect(fnv1a("ab")).not.toBe(fnv1a("ba"));
    expect(fnv1a("screen.run")).not.toBe(fnv1a("nur.neercs"));
  });

  it("hash space is 32-bit — no value exceeds 8 hex characters", () => {
    const samples = ["", "a", "z".repeat(1000), "混合テスト", "🔒"];
    for (const s of samples) {
      expect(fnv1a(s).length).toBe(8);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("computeEntryHash", () => {
  it("is deterministic for the same inputs", () => {
    const h1 = computeEntryHash(undefined, { event: "screen.run" }, "2026-05-17T00:00:00Z", 1);
    const h2 = computeEntryHash(undefined, { event: "screen.run" }, "2026-05-17T00:00:00Z", 1);
    expect(h1).toBe(h2);
  });

  it("changes when prevHash changes", () => {
    const h1 = computeEntryHash(undefined, { event: "test" }, "2026-05-17T00:00:00Z", 1);
    const h2 = computeEntryHash("aabbccdd", { event: "test" }, "2026-05-17T00:00:00Z", 1);
    expect(h1).not.toBe(h2);
  });

  it("changes when payload changes", () => {
    const h1 = computeEntryHash(undefined, { event: "case.open" }, "2026-05-17T00:00:00Z", 1);
    const h2 = computeEntryHash(undefined, { event: "case.close" }, "2026-05-17T00:00:00Z", 1);
    expect(h1).not.toBe(h2);
  });

  it("changes when seq changes", () => {
    const h1 = computeEntryHash(undefined, { event: "test" }, "2026-05-17T00:00:00Z", 1);
    const h2 = computeEntryHash(undefined, { event: "test" }, "2026-05-17T00:00:00Z", 2);
    expect(h1).not.toBe(h2);
  });

  it("changes when timestamp changes", () => {
    const h1 = computeEntryHash(undefined, { event: "test" }, "2026-05-17T00:00:00Z", 1);
    const h2 = computeEntryHash(undefined, { event: "test" }, "2026-05-17T01:00:00Z", 1);
    expect(h1).not.toBe(h2);
  });

  it("undefined prevHash and empty-string prevHash produce the same hash (nullish coalescing)", () => {
    // The implementation uses `prevHash ?? ""` — so undefined and "" are equivalent.
    // This is expected: the first chain entry has no prevHash, which is the same
    // as an empty-string genesis marker in the hash input.
    const h1 = computeEntryHash(undefined, { event: "a" }, "T1", 1);
    const h2 = computeEntryHash("", { event: "a" }, "T1", 1);
    expect(h1).toBe(h2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("verifyChain", () => {
  it("empty chain is trivially intact", () => {
    const { intact, firstBreakAt } = verifyChain([]);
    expect(intact).toBe(true);
    expect(firstBreakAt).toBeNull();
  });

  it("single-entry chain is intact", () => {
    const chain = buildChain([{ payload: { event: "case.open" }, at: "2026-05-17T00:00:00Z" }]);
    const { intact, firstBreakAt } = verifyChain(chain);
    expect(intact).toBe(true);
    expect(firstBreakAt).toBeNull();
  });

  it("three-entry chain built correctly is intact", () => {
    const chain = buildChain([
      { payload: { event: "screen.run", actor: "system" }, at: "2026-05-17T00:00:00Z" },
      { payload: { event: "case.open", caseId: "CASE-20260517-a3f9" }, at: "2026-05-17T01:00:00Z" },
      { payload: { event: "disposition.set", decision: "clear" }, at: "2026-05-17T02:00:00Z" },
    ]);
    const { intact, firstBreakAt } = verifyChain(chain);
    expect(intact).toBe(true);
    expect(firstBreakAt).toBeNull();
  });

  it("detects a tampered entryHash (hash mismatch) at seq 2", () => {
    const chain = buildChain([
      { payload: { event: "A" }, at: "2026-05-17T00:00:00Z" },
      { payload: { event: "B" }, at: "2026-05-17T01:00:00Z" },
    ]);
    // Directly corrupt the stored entryHash of entry 2.
    chain[1]!.entryHash = "00000000";
    const { intact, firstBreakAt } = verifyChain(chain);
    expect(intact).toBe(false);
    expect(firstBreakAt).toBe(2);
  });

  it("detects a tampered payload at seq 1", () => {
    const chain = buildChain([
      { payload: { event: "open", amount: 100 }, at: "2026-05-17T00:00:00Z" },
      { payload: { event: "close" }, at: "2026-05-17T01:00:00Z" },
    ]);
    // Silently mutate the payload after hashing — hash check fails at seq 1.
    chain[0]!.payload = { event: "open", amount: 999 };
    const { intact, firstBreakAt } = verifyChain(chain);
    expect(intact).toBe(false);
    expect(firstBreakAt).toBe(1);
  });

  it("detects a broken prevHash link (insertion attack)", () => {
    const chain = buildChain([
      { payload: { event: "A" }, at: "T1" },
      { payload: { event: "B" }, at: "T2" },
      { payload: { event: "C" }, at: "T3" },
    ]);
    // Sever entry 3's prevHash link without touching its own payload.
    // Re-compute entry 3's entryHash with the tampered prevHash so the
    // individual hash check passes — only the link check should fire.
    chain[2]!.prevHash = "deadbeef";
    chain[2]!.entryHash = computeEntryHash(
      "deadbeef",
      chain[2]!.payload,
      chain[2]!.at,
      chain[2]!.seq,
    );
    const { intact, firstBreakAt } = verifyChain(chain);
    expect(intact).toBe(false);
    expect(firstBreakAt).toBe(3);
  });

  it("reports the earliest broken seq, not the latest, when multiple entries are tampered", () => {
    const chain = buildChain([
      { payload: { event: "A" }, at: "T1" },
      { payload: { event: "B" }, at: "T2" },
      { payload: { event: "C" }, at: "T3" },
    ]);
    // Tamper both entry 1 and entry 3.
    chain[0]!.payload = { event: "TAMPERED" };
    chain[2]!.payload = { event: "ALSO_TAMPERED" };
    const { intact, firstBreakAt } = verifyChain(chain);
    expect(intact).toBe(false);
    expect(firstBreakAt).toBe(1); // Must be the first break, not the last.
  });

  it("handles out-of-order input by sorting on seq before walking", () => {
    // Build chain in order, then shuffle the array.
    const chain = buildChain([
      { payload: { event: "first" }, at: "T1" },
      { payload: { event: "second" }, at: "T2" },
      { payload: { event: "third" }, at: "T3" },
    ]);
    const shuffled = [chain[2]!, chain[0]!, chain[1]!];
    const { intact } = verifyChain(shuffled);
    expect(intact).toBe(true);
  });
});
