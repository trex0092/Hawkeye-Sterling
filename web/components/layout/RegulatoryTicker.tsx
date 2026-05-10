"use client";

import { useEffect, useState } from "react";

interface TickerItem {
  label: string;
  tone: "green" | "amber" | "red";
}

const BASE_ITEMS: TickerItem[] = [
  { label: "FATF REC.6 · TFS MANDATORY SCREENING ACTIVE", tone: "green" },
  { label: "FDL NO.10/2025 ART.24 · 10-YEAR RETENTION ACTIVE", tone: "green" },
  { label: "CABINET RES 134/2025 ART.18 · CO NOTIFICATION ACTIVE", tone: "amber" },
  { label: "OFAC SDN · CONSOLIDATED LIST ACTIVE", tone: "green" },
  { label: "EU CFSP 2014/145 · SANCTIONS LIST ACTIVE", tone: "green" },
  { label: "EOCN LOCAL · WATCH-LIST ACTIVE", tone: "green" },
  { label: "FATF R.24/25 · UBO VERIFICATION ACTIVE", tone: "green" },
  { label: "UN SC RES 1267/1989/2253 · ISIL/AL-QAIDA LIST ACTIVE", tone: "green" },
  { label: "MoE CIRCULAR 2/2024 · DPMS AED 55K REPORTING ACTIVE", tone: "green" },
  { label: "FDL 10/2025 ART.4 · EWRA ANNUAL REVIEW REQUIRED", tone: "amber" },
  { label: "FATF R.15 · VIRTUAL ASSETS TRAVEL RULE ACTIVE", tone: "green" },
  { label: "FDL 10/2025 ART.19 · 10-YEAR ADVERSE MEDIA LOOKBACK ACTIVE", tone: "green" },
];

const TONE_DOT: Record<TickerItem["tone"], string> = {
  green: "bg-green",
  amber: "bg-amber",
  red: "bg-red",
};

export function RegulatoryTicker() {
  const [syncTime, setSyncTime] = useState<string>("");
  const [liveItems, setLiveItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setSyncTime(
        now.toLocaleTimeString("en-GB", {
          timeZone: "Asia/Dubai",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      );
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // Fetch top priority items from the regulatory feed and surface them in the ticker.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/regulatory-feed");
        if (cancelled) return;
        if (!res.ok) {
          console.warn(`[hawkeye] regulatory-feed HTTP ${res.status} — ticker stays on static items`);
          return;
        }
        const data = await res.json() as { ok: boolean; items?: Array<{ title: string; source: string; tone: string }> };
        if (cancelled) return;
        if (!data.ok || !Array.isArray(data.items)) return;
        const top = data.items
          .filter((i) => i.tone === "red" || i.tone === "amber")
          .slice(0, 6)
          .map((i) => ({
            label: `${i.source} · ${i.title.toUpperCase().slice(0, 70)}`,
            tone: i.tone as TickerItem["tone"],
          }));
        setLiveItems(top);
      } catch (err) {
        if (cancelled) return;
        console.warn("[hawkeye] regulatory-feed threw — ticker stays on static items:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const items: TickerItem[] = [
    ...BASE_ITEMS.slice(0, 1),
    { label: `UNSC CONSOLIDATED · LAST SYNC ${syncTime || "--:--"}`, tone: "green" },
    ...BASE_ITEMS.slice(1),
    ...liveItems,
  ];

  // Duplicate for seamless loop
  const doubled = [...items, ...items];

  return (
    <div className="w-full overflow-hidden border-b border-hair-2 bg-bg-panel">
      <div className="flex items-center h-[30px]">
        {/* Static label */}
        <div className="shrink-0 px-3 h-full flex items-center border-r border-hair-2 bg-bg-1">
          <span className="text-9 font-mono font-semibold uppercase tracking-wide-4 text-amber whitespace-nowrap">
            Regulatory basis
          </span>
        </div>

        {/* Scrolling track */}
        <div className="flex-1 overflow-hidden relative">
          <div
            className="flex items-center gap-0 whitespace-nowrap"
            style={{ animation: "ticker-scroll 60s linear infinite" }}
          >
            {doubled.map((item, i) => (
              <span
                key={`tick-${i}`}
                className="inline-flex items-center gap-1.5 px-4 text-9 font-mono text-ink-2 uppercase tracking-wide-2"
              >
                <span
                  className={`w-1 h-1 rounded-full shrink-0 ${TONE_DOT[item.tone]}`}
                />
                {item.label}
                <span className="text-hair-3 mx-2">·</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
