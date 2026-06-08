"use client";

import { useState } from "react";

// Standardised 8-button neon action bar — fixed top-right on every module.
// True neon aesthetic: dark-glass background, glowing border + text-shadow.

interface ModuleActionBarProps {
  asanaModule?: string;
  asanaLabel?: string;
  asanaSummary?: string;
}

type AsanaStatus = "idle" | "posting" | "sent" | "error";

const BTNS = [
  { key: "asana",   label: "ASANA",     color: "#00ff88" },
  { key: "ai",      label: "AI",        color: "#ff2d78" },
  { key: "csv",     label: "CSV",       color: "#00e5ff" },
  { key: "run",     label: "▷ RUN",    color: "#ffe600" },
  { key: "pdf",     label: "PDF",       color: "#ff6b1a" },
  { key: "refresh", label: "↻ REFRESH", color: "#39ff14" },
  { key: "add",     label: "+ ADD",     color: "#bf5fff" },
  { key: "sync",    label: "↻ SYNC",   color: "#00cfff" },
] as const;

type BtnKey = typeof BTNS[number]["key"];

export function ModuleActionBar({ asanaModule, asanaLabel, asanaSummary }: ModuleActionBarProps) {
  const [asanaStatus, setAsanaStatus] = useState<AsanaStatus>("idle");

  const handle = async (key: BtnKey) => {
    if (key === "asana") {
      if (asanaStatus !== "idle") { if (asanaStatus === "error") setAsanaStatus("idle"); return; }
      setAsanaStatus("posting");
      try {
        const res = await fetch("/api/module-report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            module: asanaModule ?? "unknown",
            label: asanaLabel ?? "Module",
            summary: asanaSummary ?? `Module report submitted from Hawkeye Sterling — ${asanaLabel ?? asanaModule}.`,
          }),
        });
        const json = await res.json().catch(() => null) as { ok?: boolean } | null;
        setAsanaStatus(res.ok && json?.ok ? "sent" : "error");
      } catch {
        setAsanaStatus("error");
      }
      return;
    }
    if (key === "refresh" || key === "sync") {
      window.location.reload();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 88,
        right: 12,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        pointerEvents: "all",
      }}
    >
      {BTNS.map((b) => {
        let label = b.label;
        if (b.key === "asana") {
          if (asanaStatus === "posting") label = "ASANA…";
          else if (asanaStatus === "sent") label = "ASANA ✓";
          else if (asanaStatus === "error") label = "ASANA ⚠";
        }
        return (
          <NeonBtn
            key={b.key}
            label={label}
            color={b.color}
            onClick={() => handle(b.key)}
          />
        );
      })}
    </div>
  );
}

function NeonBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const idle: React.CSSProperties = {
    height: 24,
    minWidth: 82,
    padding: "0 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    // dark glass — the neon color shines through, not fills
    background: `rgba(0,0,0,0.55)`,
    border: `1px solid ${color}`,
    borderRadius: 2,
    color: color,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "'Inter','system-ui',sans-serif",
    userSelect: "none",
    // neon glow: text + border + outer halo
    textShadow: `0 0 4px ${color}, 0 0 10px ${color}cc, 0 0 18px ${color}88`,
    boxShadow: `0 0 4px ${color}88, 0 0 10px ${color}44, inset 0 0 8px ${color}18`,
    transition: "text-shadow 0.15s, box-shadow 0.15s",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      style={idle}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.textShadow = `0 0 4px ${color}, 0 0 12px ${color}, 0 0 24px ${color}dd, 0 0 40px ${color}88`;
        el.style.boxShadow  = `0 0 8px ${color}cc, 0 0 20px ${color}88, 0 0 36px ${color}44, inset 0 0 10px ${color}28`;
        el.style.background = `rgba(0,0,0,0.35)`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.textShadow = `0 0 4px ${color}, 0 0 10px ${color}cc, 0 0 18px ${color}88`;
        el.style.boxShadow  = `0 0 4px ${color}88, 0 0 10px ${color}44, inset 0 0 8px ${color}18`;
        el.style.background = `rgba(0,0,0,0.55)`;
      }}
    >
      {label}
    </button>
  );
}
