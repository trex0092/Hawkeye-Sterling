"use client";

import { useState } from "react";

// Standardised 8-button neon action bar — fixed top-right on every module.
// Replaces all per-module sidebarActions buttons with one consistent toolbar.

interface ModuleActionBarProps {
  asanaModule?: string;
  asanaLabel?: string;
  asanaSummary?: string;
}

type AsanaStatus = "idle" | "posting" | "sent" | "error";

const BTNS = [
  { key: "asana",   label: "ASANA",     bg: "#15803d", glow: "#22c55e", text: "#f0fdf4" },
  { key: "ai",      label: "AI",        bg: "#be185d", glow: "#f472b6", text: "#fff"    },
  { key: "csv",     label: "CSV",       bg: "#0e7490", glow: "#22d3ee", text: "#ecfeff" },
  { key: "run",     label: "▷ RUN",    bg: "#a16207", glow: "#facc15", text: "#fefce8" },
  { key: "pdf",     label: "PDF",       bg: "#c2410c", glow: "#fb923c", text: "#fff"    },
  { key: "refresh", label: "↻ REFRESH", bg: "#166534", glow: "#4ade80", text: "#f0fdf4" },
  { key: "add",     label: "+ ADD",     bg: "#7e22ce", glow: "#c084fc", text: "#faf5ff" },
  { key: "sync",    label: "↻ SYNC",   bg: "#155e75", glow: "#67e8f9", text: "#ecfeff" },
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
        gap: 3,
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
            bg={b.bg}
            glow={b.glow}
            text={b.text}
            onClick={() => handle(b.key)}
          />
        );
      })}
    </div>
  );
}

function NeonBtn({
  label,
  bg,
  glow,
  text,
  onClick,
}: {
  label: string;
  bg: string;
  glow: string;
  text: string;
  onClick: () => void;
}) {
  const base: React.CSSProperties = {
    height: 22,
    minWidth: 76,
    padding: "0 9px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: `linear-gradient(180deg, ${glow}bb 0%, ${bg} 65%)`,
    border: `1px solid ${glow}99`,
    borderRadius: 3,
    color: text,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: `0 0 6px ${glow}55, 0 1px 4px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.22)`,
    transition: "box-shadow 0.15s, filter 0.15s",
    fontFamily: "'Inter','system-ui',sans-serif",
    userSelect: "none",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      style={base}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 0 14px ${glow}99, 0 2px 8px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.3)`;
        e.currentTarget.style.filter = "brightness(1.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 0 6px ${glow}55, 0 1px 4px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.22)`;
        e.currentTarget.style.filter = "brightness(1)";
      }}
    >
      {label}
    </button>
  );
}
