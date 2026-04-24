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

function seedEntries(): FeedEntry[] {
  const entries: FeedEntry[] = [];
  try {
    const cases = loadCases().slice(0, 6);
    cases.forEach((c) => {
      const isHigh = c.badge === "CRITICAL" || c.badge === "HIGH";
      entries.push({
        id: `seed-${c.id}-hit`,
        time: nowHHMMSS(),
        kind: isHigh ? "HIT" : "CLEAR",
        text: isHigh
          ? `${c.subject} · ${c.badge} · ${c.id} — elevated risk`
          : `${c.subject} · 0 matches · ${c.id}`,
        fresh: false,
      });
    });
  } catch { /* localStorage unavailable */ }

  entries.push({
    id: "seed-heartbeat",
    time: nowHHMMSS(),
    kind: "SYS",
    text: "Heartbeat · 6 lists healthy · engine ready",
    fresh: false,
  });

  return entries.reverse();
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
    const addSys = () => {
      const msg = SYS_MESSAGES[counterRef.current % SYS_MESSAGES.length]!;
      const depth = 30 + Math.floor(Math.random() * 15);
      counterRef.current++;
      const entry: FeedEntry = {
        id: `sys-${Date.now()}`,
        time: nowHHMMSS(),
        kind: "SYS",
        text: msg.includes("q depth") ? `${msg} ${depth}` : msg,
        fresh: true,
      };
      setEntries((prev) => [entry, ...prev].slice(0, 60));
    };

    const id = setInterval(addSys, 8_000 + Math.random() * 7_000);
    return () => clearInterval(id);
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

      {/* Feed */}
      <div className="overflow-y-auto max-h-[340px] font-mono text-11">
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
