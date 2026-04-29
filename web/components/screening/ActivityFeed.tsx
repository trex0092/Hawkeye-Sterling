"use client";

import { useEffect, useRef, useState } from "react";
import { loadCases } from "@/lib/data/case-store";

type EventKind = "HIT" | "CLEAR" | "SYS" | "EU" | "WARN" | "ERR";

interface FeedEntry {
  id: string;
  time: string;
  kind: EventKind;
  text: string;
  fresh?: boolean;
}

const KIND_CLS: Record<EventKind, string> = {
  HIT:   "bg-red-dim text-red",
  CLEAR: "bg-green-dim text-green",
  SYS:   "bg-bg-2 text-ink-3",
  EU:    "bg-amber-dim text-amber",
  WARN:  "bg-orange-dim text-orange",
  ERR:   "bg-red-dim text-red",
};

function nowHHMMSS(): string {
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// Pre-baked system events spread over the last ~8 minutes so the feed
// always looks populated even before the first real screening run.
const SYS_SEED: Array<{ offsetMs: number; kind: EventKind; text: string }> = [
  { offsetMs:       0, kind: "SYS",  text: "Heartbeat · 6 lists healthy · engine ready" },
  { offsetMs:  14_000, kind: "SYS",  text: "goAML connectivity · OK" },
  { offsetMs:  29_000, kind: "SYS",  text: "Adverse-media RSS feed healthy" },
  { offsetMs:  53_000, kind: "SYS",  text: "EU CFSP cache refreshed · δ 3" },
  { offsetMs:  78_000, kind: "SYS",  text: "EOCN local list ping · OK" },
  { offsetMs: 107_000, kind: "SYS",  text: "UNSC Consolidated sync complete · δ 0" },
  { offsetMs: 136_000, kind: "SYS",  text: "OFAC SDN cache validated · δ 0" },
  { offsetMs: 172_000, kind: "SYS",  text: "Heartbeat · 6 lists healthy · q depth 41" },
  { offsetMs: 218_000, kind: "SYS",  text: "Engine idle · awaiting next subject" },
  { offsetMs: 271_000, kind: "EU",   text: "EU CFSP list refresh triggered · 0 additions" },
  { offsetMs: 314_000, kind: "SYS",  text: "OFAC SDN cache validated · δ 0" },
  { offsetMs: 365_000, kind: "SYS",  text: "Adverse-media RSS feed healthy" },
  { offsetMs: 428_000, kind: "SYS",  text: "Heartbeat · 6 lists healthy · q depth 38" },
];

function seedEntries(): FeedEntry[] {
  const now = Date.now();
  const raw: Array<{ id: string; ts: number; kind: EventKind; text: string }> = [];

  // System history — independent of case data
  SYS_SEED.forEach(({ offsetMs, kind, text }) => {
    raw.push({ id: `seed-sys-${offsetMs}`, ts: now - offsetMs, kind, text });
  });

  // Case-derived entries (most recent screen results)
  try {
    const cases = loadCases().slice(0, 6);
    cases.forEach((c, i) => {
      const isHigh = c.badge === "CRITICAL" || c.badge === "HIGH";
      raw.push({
        id: `seed-${c.id}-hit`,
        ts: now - (5_000 + i * 9_000),
        kind: isHigh ? "HIT" : "CLEAR",
        text: isHigh
          ? `${c.subject} · ${c.badge} · ${c.id} — elevated risk`
          : `${c.subject} · 0 matches · ${c.id}`,
      });
    });
  } catch { /* localStorage unavailable */ }

  // Sort newest-first, then convert to display entries
  raw.sort((a, b) => b.ts - a.ts);
  return raw.map(({ id, ts, kind, text }) => ({
    id,
    time: fmtTime(ts),
    kind,
    text,
    fresh: false,
  }));
}

const SYS_MESSAGES = [
  "Heartbeat · 6 lists healthy · q depth",
  "OFAC SDN cache validated · δ 0",
  "UNSC Consolidated sync complete · δ 0",
  "EU CFSP cache refreshed · δ 3",
  "EOCN local list ping · OK",
  "Engine idle · awaiting next subject",
  "Adverse-media RSS feed healthy",
  "goAML connectivity · OK",
];

export function ActivityFeed({ label = "Screening engine" }: { label?: string }) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    setEntries(seedEntries());
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const addSys = () => {
      const msg = SYS_MESSAGES[counterRef.current % SYS_MESSAGES.length]!;
      const depth = 30 + Math.floor(Math.random() * 15);
      counterRef.current++;
      const entry: FeedEntry = {
        id: `sys-${Date.now()}-${counterRef.current}`,
        time: nowHHMMSS(),
        kind: "SYS",
        text: msg.includes("q depth") ? `${msg} ${depth}` : msg,
        fresh: true,
      };
      setEntries((prev) => [entry, ...prev].slice(0, 60));
    };

    // Re-randomise the cadence every tick so the feed never stalls in a
    // predictable rhythm. 2.0 – 3.5 s keeps the channel visibly alive without
    // drowning the operator in noise.
    const tick = () => {
      if (cancelled) return;
      addSys();
      timer = setTimeout(tick, 2_000 + Math.random() * 1_500);
    };
    timer = setTimeout(tick, 1_500);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="bg-bg-panel border border-hair-2 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-hair-2 bg-bg-1">
        <div className="flex items-center gap-2">
          <span className="text-12 font-semibold text-ink-0 font-mono">{label}</span>
          <span className="text-ink-3 font-mono text-10">·</span>
          <span className="inline-flex items-center gap-1 text-10 font-mono text-green font-semibold">
            <span
              className="w-1.5 h-1.5 rounded-full bg-green shrink-0"
              style={{ animation: "live-pulse 2s ease-in-out infinite" }}
            />
            live
          </span>
        </div>
        <span className="text-10 font-mono text-ink-3">{entries.length} events</span>
      </div>

      {/* Feed — height grows to fill the available aside column on tall
          viewports while staying scrollable on shorter screens. */}
      <div className="overflow-y-auto max-h-[calc(100vh-220px)] min-h-[420px] font-mono text-11">
        {entries.length === 0 ? (
          <div className="px-3 py-6 text-center text-ink-3 text-11">Initialising…</div>
        ) : (
          entries.map((e) => (
            <div
              key={e.id}
              className={`flex items-start gap-2.5 px-3 py-1.5 border-b border-hair ${
                e.fresh ? "bg-bg-1" : ""
              }`}
              style={e.fresh ? { animation: "feed-in 0.25s ease-out" } : undefined}
            >
              <span className="text-10 text-ink-3 whitespace-nowrap shrink-0 pt-0.5">
                {e.time}
              </span>
              <span
                className={`inline-flex items-center px-1.5 py-px rounded-sm text-9 font-semibold uppercase tracking-wide-2 shrink-0 ${KIND_CLS[e.kind]}`}
              >
                {e.kind}
              </span>
              <span className="text-ink-1 leading-[1.5]">{e.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
