"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

// Standardised 8-button action bar — portalled to document.body so
// position:fixed is always relative to the viewport, never broken by a
// parent overflow/transform/will-change containing block.

interface ModuleActionBarProps {
  asanaModule?: string;
  asanaLabel?: string;
  asanaSummary?: string;
}

type AsanaStatus = "idle" | "posting" | "sent" | "error";

// Colors pulled from globals.css CSS variables (resolved to actual hex/rgba)
const BTNS = [
  { key: "asana",   label: "ASANA",     color: "#10b981", dim: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.30)"  },
  { key: "ai",      label: "AI",        color: "#ec4899", dim: "rgba(236,72,153,0.08)",  border: "rgba(236,72,153,0.30)"  },
  { key: "csv",     label: "CSV",       color: "#8b5cf6", dim: "rgba(139,92,246,0.10)",  border: "rgba(139,92,246,0.30)"  },
  { key: "run",     label: "▷ RUN",    color: "#3b82f6", dim: "rgba(59,130,246,0.10)",   border: "rgba(59,130,246,0.30)"  },
  { key: "pdf",     label: "PDF",       color: "#f97316", dim: "rgba(249,115,22,0.10)",  border: "rgba(249,115,22,0.30)"  },
  { key: "refresh", label: "↻ REFRESH", color: "#10b981", dim: "rgba(16,185,129,0.10)",  border: "rgba(16,185,129,0.30)"  },
  { key: "add",     label: "+ ADD",     color: "#f59e0b", dim: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.30)"  },
  { key: "sync",    label: "↻ SYNC",   color: "#3b82f6", dim: "rgba(59,130,246,0.10)",   border: "rgba(59,130,246,0.30)"  },
] as const;

type BtnKey = typeof BTNS[number]["key"];

export function ModuleActionBar({ asanaModule, asanaLabel, asanaSummary }: ModuleActionBarProps) {
  const [asanaStatus, setAsanaStatus] = useState<AsanaStatus>("idle");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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
    if (key === "refresh" || key === "sync") window.location.reload();
  };

  if (!mounted) return null;

  const bar = (
    <div style={{ position: "fixed", top: 88, right: 40, zIndex: 9999, display: "flex", flexDirection: "column", gap: 2, pointerEvents: "auto" }}>
      {BTNS.map((b) => {
        let label: string = b.label;
        if (b.key === "asana") {
          if (asanaStatus === "posting") label = "ASANA…";
          else if (asanaStatus === "sent")  label = "ASANA ✓";
          else if (asanaStatus === "error") label = "ASANA ⚠";
        }
        return (
          <AppBtn key={b.key} label={label} color={b.color} dim={b.dim} border={b.border} onClick={() => handle(b.key)} />
        );
      })}
    </div>
  );

  return createPortal(bar, document.body);
}

function AppBtn({ label, color, dim, border, onClick }: {
  label: string; color: string; dim: string; border: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 16,
        padding: "0 7px",
        background: dim,
        border: `1px solid ${border}`,
        borderRadius: 3,
        color,
        fontSize: 8,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontFamily: "inherit",
        transition: "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = dim.replace(/[\d.]+\)$/, "0.18)");
        e.currentTarget.style.borderColor = color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = dim;
        e.currentTarget.style.borderColor = border;
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0, animation: "live-pulse 2s ease-in-out infinite" }} />
      {label}
    </button>
  );
}
