"use client";

import { useEffect, useRef, useState } from "react";
import { ALL_COLUMNS, type TableColumnKey } from "@/lib/types";

interface Props {
  visible: Record<TableColumnKey, boolean>;
  onChange: (next: Record<TableColumnKey, boolean>) => void;
}

const STORAGE_KEY = "hawkeye.screening-columns.v1";

export function defaultColumnVisibility(): Record<TableColumnKey, boolean> {
  const out = {} as Record<TableColumnKey, boolean>;
  for (const c of ALL_COLUMNS) out[c.key] = c.defaultOn;
  return out;
}

export function loadColumnVisibility(): Record<TableColumnKey, boolean> {
  if (typeof window === "undefined") return defaultColumnVisibility();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultColumnVisibility();
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return defaultColumnVisibility();
    const out = defaultColumnVisibility();
    for (const c of ALL_COLUMNS) {
      const v = (parsed as Record<string, unknown>)[c.key];
      if (typeof v === "boolean") out[c.key] = v;
    }
    return out;
  } catch {
    return defaultColumnVisibility();
  }
}

export function persistColumnVisibility(v: Record<TableColumnKey, boolean>): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* quota */ }
}

export function ColumnChooser({ visible, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const t = window.setTimeout(() => window.addEventListener("mousedown", onClick), 0);
    return () => { window.removeEventListener("mousedown", onClick); window.clearTimeout(t); };
  }, [open]);

  const visibleCount = ALL_COLUMNS.filter((c) => visible[c.key]).length;

  const toggle = (k: TableColumnKey) => {
    const next = { ...visible, [k]: !visible[k] };
    onChange(next);
    persistColumnVisibility(next);
  };

  const reset = () => {
    const d = defaultColumnVisibility();
    onChange(d);
    persistColumnVisibility(d);
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-[5px] text-11.5 font-medium border border-hair-2 rounded text-ink-0 bg-bg-panel hover:border-hair-3 hover:bg-bg-2"
        title="Choose columns"
      >
        Columns
        <span className="text-10 font-mono text-ink-3">{visibleCount}/{ALL_COLUMNS.length}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-56 bg-bg-panel border border-hair-2 rounded-lg shadow-lg p-2">
          <div className="text-10 uppercase tracking-wide-3 text-ink-3 mb-1.5 px-1.5">Visible columns</div>
          {ALL_COLUMNS.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-bg-1 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={visible[c.key]}
                onChange={() => toggle(c.key)}
                className="accent-brand"
              />
              <span className="text-12 text-ink-0">{c.label}</span>
            </label>
          ))}
          <div className="border-t border-hair mt-1 pt-1 px-1.5">
            <button
              type="button"
              onClick={reset}
              className="text-10 text-ink-3 hover:text-ink-0 uppercase tracking-wide-3"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
