"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { escapeCsvCell } from "@/lib/utils/escapeCsvCell";

// Standardised 8-button action bar — portalled to document.body so
// position:fixed is always relative to the viewport, never broken by a
// parent overflow/transform/will-change containing block.
//
// Default behaviours (no props needed):
//   AI      → fires CustomEvent("hawkeye:ai") + opens /mlro-advisor in new tab (or onAi callback)
//   CSV     → extracts visible table from DOM and downloads as CSV (or onCsv callback)
//   RUN     → reloads page (or onRun callback)
//   PDF     → window.print() (browser saves as PDF)
//   REFRESH → window.location.reload()
//   +ADD    → fires CustomEvent("hawkeye:add") + shows brief toast (or onAdd callback)
//   SYNC    → window.location.reload()
//   ASANA   → POST /api/module-report

function extractTableAsCsv(): string {
  const tables = Array.from(document.querySelectorAll("table"));
  if (!tables.length) return "";
  // Pick the table with the most rows
  let table = tables[0]!;
  for (const t of tables) {
    if (t.rows.length > table.rows.length) table = t;
  }
  const rows: string[] = [];
  for (const row of Array.from(table.rows)) {
    const cells = Array.from(row.cells).map((cell) =>
      escapeCsvCell(cell.textContent?.trim()),
    );
    rows.push(cells.join(","));
  }
  return rows.join("\n");
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ModuleActionBarProps {
  asanaModule?: string;
  asanaLabel?: string;
  asanaSummary?: string;
  onAi?: () => void;
  onCsv?: () => void;
  onRun?: () => void;
  onAdd?: () => void;
  onSync?: () => void;
}

type AsanaStatus = "idle" | "posting" | "sent" | "error";
type ToastMsg = { text: string; key: number };

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

export function ModuleActionBar({
  asanaModule,
  asanaLabel,
  asanaSummary,
  onAi,
  onCsv,
  onRun,
  onAdd,
  onSync,
}: ModuleActionBarProps) {
  const [asanaStatus, setAsanaStatus] = useState<AsanaStatus>("idle");
  const [mounted, setMounted] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);

  const showToast = useCallback((text: string) => {
    setToast({ text, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => { setMounted(true); }, []);

  const handle = async (key: BtnKey) => {
    switch (key) {
      case "asana": {
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
      case "ai":
        if (onAi) { onAi(); return; }
        window.dispatchEvent(new CustomEvent("hawkeye:ai", { bubbles: true }));
        window.open("/mlro-advisor", "_blank", "noopener,noreferrer");
        return;
      case "csv":
        if (onCsv) { onCsv(); return; }
        window.dispatchEvent(new CustomEvent("hawkeye:csv", { bubbles: true }));
        {
          const csv = extractTableAsCsv();
          if (csv) {
            const slug = (asanaModule ?? "export").replace(/[^a-z0-9-]/gi, "-");
            downloadCsv(csv, `${slug}-${new Date().toISOString().slice(0, 10)}.csv`);
            showToast("CSV downloaded");
          } else {
            showToast("No table data found on this page");
          }
        }
        return;
      case "run":
        if (onRun) { onRun(); return; }
        window.dispatchEvent(new CustomEvent("hawkeye:run", { bubbles: true }));
        window.location.reload();
        return;
      case "pdf":
        window.print();
        return;
      case "refresh":
        window.location.reload();
        return;
      case "sync":
        if (onSync) { onSync(); showToast("Synced ✓"); return; }
        window.location.reload();
        return;
      case "add":
        if (onAdd) { onAdd(); return; }
        window.dispatchEvent(new CustomEvent("hawkeye:add", { bubbles: true }));
        showToast("Use the form on this page to add a new record");
        return;
    }
  };

  if (!mounted) return null;

  const LEFT_KEYS  = ["asana", "ai", "csv", "run"]     as const;
  const RIGHT_KEYS = ["pdf", "refresh", "add", "sync"] as const;

  const renderCol = (keys: readonly string[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {BTNS.filter((b) => (keys as readonly string[]).includes(b.key)).map((b) => {
        let label: string = b.label;
        if (b.key === "asana") {
          if (asanaStatus === "posting") label = "ASANA…";
          else if (asanaStatus === "sent")  label = "ASANA ✓";
          else if (asanaStatus === "error") label = "ASANA ⚠";
        }
        return (
          <AppBtn key={b.key} label={label} color={b.color} dim={b.dim} border={b.border} onClick={() => { void handle(b.key); }} />
        );
      })}
    </div>
  );

  const bar = (
    <>
      <div className="print-hide" style={{ position: "fixed", top: 60, right: 4, zIndex: 9999, display: "flex", flexDirection: "row", gap: 2, pointerEvents: "auto", background: "#0f0f0f", padding: "4px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.06)" }}>
        {renderCol(LEFT_KEYS)}
        {renderCol(RIGHT_KEYS)}
      </div>
      {toast && (
        <div
          key={toast.key}
          className="print-hide"
          style={{
            position: "fixed", bottom: 24, right: 16, zIndex: 10000,
            background: "#1a1a2e", border: "1px solid rgba(59,130,246,0.4)",
            borderRadius: 6, padding: "8px 14px",
            color: "#93c5fd", fontSize: 11, fontWeight: 600,
            letterSpacing: "0.04em", pointerEvents: "none",
            animation: "fadeInUp 0.2s ease",
          }}
        >
          {toast.text}
        </div>
      )}
    </>
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
