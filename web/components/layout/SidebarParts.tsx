"use client";

import type { JSX, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  loadOperatorRole,
  saveOperatorRole,
  ROLE_LABEL,
  CARD_ROLES,
  type OperatorRole,
} from "@/lib/data/operator-role";
import type { FilterKey, SavedFilterSet } from "@/lib/types";

const OPERATOR_STORAGE_KEY = "hawkeye.operator";

// ─── Shell & Section ───────────────────────────────────────────────────────

export function SidebarShell({ children }: { children: ReactNode }) {
  return (
    <aside className="bg-bg-panel border-r border-hair-2 border-t-2 border-t-brand-line px-4 py-5 overflow-y-auto print:hidden">
      {children}
    </aside>
  );
}

export function SidebarSection({
  title,
  children,
  collapsible,
  actions,
}: {
  title: string;
  children: ReactNode;
  collapsible?: boolean;
  actions?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={collapsible ? () => setCollapsed((c) => !c) : undefined}
          className={`flex items-center gap-1.5 text-10.5 font-semibold tracking-wide-4 uppercase text-ink-2 ${collapsible ? "cursor-pointer hover:text-ink-1" : "cursor-default"}`}
        >
          <span className="w-1 h-1 rounded-full bg-brand opacity-60 shrink-0" />
          {collapsible && (
            <svg
              width="7" height="7" viewBox="0 0 8 8" fill="currentColor"
              className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}
            >
              <path d="M0 2L4 6L8 2Z" />
            </svg>
          )}
          {title}
        </button>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
      {!collapsed && children}
    </div>
  );
}

// ─── Filter list types ─────────────────────────────────────────────────────

export interface SidebarFilterItem<K extends string> {
  key: K;
  label: string;
  count: string;
}

interface SidebarFilterListProps<K extends string> {
  items: SidebarFilterItem<K>[];
  activeKeys: K[];
  onSelect: (key: K, multiSelect: boolean) => void;
  pinnedKeys?: K[];
  onTogglePin?: (key: K) => void;
  countDeltas?: Record<string, number>;
  lastRefreshed?: Date | null;
  savedFilters?: SavedFilterSet[];
  onSaveFilter?: (label: string) => void;
  onDeleteSaved?: (id: string) => void;
  onApplySaved?: (keys: FilterKey[]) => void;
}

// ─── Filter metadata ───────────────────────────────────────────────────────

const FILTER_ICON: Record<string, JSX.Element> = {
  all: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="1" y1="3" x2="11" y2="3" /><line x1="1" y1="6" x2="11" y2="6" /><line x1="1" y1="9" x2="11" y2="9" />
    </svg>
  ),
  critical: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 1L11 10H1L6 1Z" /><line x1="6" y1="5" x2="6" y2="7.5" /><circle cx="6" cy="9" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  ),
  sanctions: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M6 1L11 3.5V6C11 8.8 8.8 10.8 6 11.5C3.2 10.8 1 8.8 1 6V3.5L6 1Z" />
      <line x1="4" y1="4" x2="8" y2="8" /><line x1="8" y1="4" x2="4" y2="8" />
    </svg>
  ),
  edd: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="5" cy="5" r="4" /><line x1="8" y1="8" x2="11" y2="11" />
    </svg>
  ),
  pep: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="6" cy="4" r="2.5" /><path d="M1 11C1 8.8 3.2 7 6 7C8.8 7 11 8.8 11 11" />
    </svg>
  ),
  sla: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="6" cy="6" r="5" /><polyline points="6,3 6,6 8.5,6" />
    </svg>
  ),
  a24: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="1" y="2" width="10" height="9" rx="1.5" /><line x1="4" y1="1" x2="4" y2="3" /><line x1="8" y1="1" x2="8" y2="3" /><line x1="1" y1="5" x2="11" y2="5" />
    </svg>
  ),
  mine: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="6" cy="4" r="2" /><path d="M2 10.5C2 8.5 3.8 7 6 7C8.2 7 10 8.5 10 10.5" />
      <circle cx="9.5" cy="9.5" r="2" fill="currentColor" stroke="none" className="text-brand" />
    </svg>
  ),
  closed: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="5" /><polyline points="3.5,6 5.2,7.8 8.5,4.2" />
    </svg>
  ),
};

// Tooltip descriptions + keyboard shortcut hints (items 5, 11, 12)
const FILTER_META: Record<string, { tooltip: string; shortcut: string }> = {
  all:       { tooltip: "All open cases in the queue",               shortcut: "1" },
  critical:  { tooltip: "Risk score ≥ 85 — immediate action needed", shortcut: "2" },
  sanctions: { tooltip: "Matched OFAC, UN, EU, or 4+ lists",         shortcut: "3" },
  edd:       { tooltip: "Enhanced Due Diligence required",            shortcut: "4" },
  pep:       { tooltip: "Politically Exposed Person flagged",         shortcut: "5" },
  sla:       { tooltip: "SLA deadline within 24 hours",              shortcut: "6" },
  a24:       { tooltip: "Opened within the last 24 hours",           shortcut: "7" },
  mine:      { tooltip: "Cases assigned to you",                      shortcut: "8" },
  closed:    { tooltip: "Cases cleared today",                        shortcut: "9" },
};

// ─── Badge style (items 1, 7) ──────────────────────────────────────────────

const HIGH_COUNT = 5;

type FilterBadgeStyle = {
  icon: string;
  badge: string;
  pulse?: boolean;
};

function getFilterStyle(key: string, count: number): FilterBadgeStyle {
  if (count === 0) return { icon: "text-ink-3", badge: "bg-bg-2 text-ink-3" };
  const hi = count >= HIGH_COUNT;
  switch (key) {
    case "critical":
      return { icon: hi ? "text-red-300" : "text-red-400", badge: hi ? "bg-red-500/25 text-red-300 font-bold" : "bg-red-500/15 text-red-400", pulse: true };
    case "sanctions":
      return { icon: hi ? "text-orange-300" : "text-orange-400", badge: hi ? "bg-orange-500/25 text-orange-300 font-bold" : "bg-orange-500/15 text-orange-400", pulse: true };
    case "sla":
      return { icon: hi ? "text-red-300" : "text-red-400", badge: hi ? "bg-red-500/25 text-red-300 font-bold" : "bg-red-500/15 text-red-400", pulse: true };
    case "edd":
      return { icon: hi ? "text-violet-300" : "text-violet-400", badge: hi ? "bg-violet-500/25 text-violet-300 font-bold" : "bg-violet-500/15 text-violet-400" };
    case "pep":
      return { icon: hi ? "text-amber-300" : "text-amber-400",  badge: hi ? "bg-amber-500/25 text-amber-300 font-bold" : "bg-amber-500/15 text-amber-400" };
    case "a24":
      return { icon: hi ? "text-sky-300" : "text-sky-400",    badge: hi ? "bg-sky-500/25 text-sky-300 font-bold" : "bg-sky-500/15 text-sky-400" };
    case "mine":
      return { icon: "text-brand-deep", badge: "bg-brand-dim text-brand-deep" };
    case "closed":
      return { icon: hi ? "text-emerald-300" : "text-emerald-400", badge: hi ? "bg-emerald-500/25 text-emerald-300 font-bold" : "bg-emerald-500/15 text-emerald-400" };
    default:
      return { icon: "text-ink-2", badge: "bg-bg-2 text-ink-2" };
  }
}

// ─── Relative time helper (item 17) ────────────────────────────────────────

function relativeTime(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 5)  return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ─── Queue-clear check ─────────────────────────────────────────────────────

const ALL_CLEAR_KEYS = ["critical", "sanctions", "edd", "pep", "sla", "a24"];

// ─── SidebarFilterList (main component) ───────────────────────────────────

export function SidebarFilterList<K extends string>({
  items,
  activeKeys,
  onSelect,
  pinnedKeys = [],
  onTogglePin,
  countDeltas = {},
  lastRefreshed,
  savedFilters = [],
  onSaveFilter,
  onDeleteSaved,
  onApplySaved,
}: SidebarFilterListProps<K>) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveDraft, setSaveDraft] = useState("");
  const [, setTick] = useState(0);
  const saveInputRef = useRef<HTMLInputElement | null>(null);

  // Tick every 15s to keep relative timestamp fresh (item 17)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // Focus save input when opened
  useEffect(() => {
    if (saveOpen) saveInputRef.current?.focus();
  }, [saveOpen]);

  const allClear = items
    .filter((i) => ALL_CLEAR_KEYS.includes(i.key))
    .every((i) => parseInt(i.count, 10) === 0);

  // Sort: pinned items float to top, then original order
  const sorted = [...items].sort((a, b) => {
    const ap = pinnedKeys.includes(a.key) ? 0 : 1;
    const bp = pinnedKeys.includes(b.key) ? 0 : 1;
    return ap - bp;
  });

  const isMulti = activeKeys.length > 1;

  return (
    <div>
      {/* Queue clear banner (item 6) */}
      {allClear && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 mb-1 rounded bg-emerald-500/10 text-emerald-400 text-11 font-medium">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2,6 4.5,8.5 10,3.5" />
          </svg>
          Queue clear
        </div>
      )}

      {/* Multi-filter hint */}
      {isMulti && (
        <div className="text-10 text-ink-3 px-2 mb-1">
          {activeKeys.length} filters active — Ctrl+click to toggle
        </div>
      )}

      <ul className="list-none p-0 m-0">
        {sorted.map((item, idx) => {
          const isActive = activeKeys.includes(item.key);
          const count   = parseInt(item.count, 10);
          const style   = getFilterStyle(item.key, count);
          const icon    = FILTER_ICON[item.key];
          const meta    = FILTER_META[item.key];
          const isPinned = pinnedKeys.includes(item.key);
          const delta    = countDeltas[item.key] ?? 0;

          // Divider before "closed" (item 4) or before pinned block end
          const prevItem = sorted[idx - 1];
          const showDivider =
            item.key === "closed" && prevItem !== undefined;

          return (
            <li key={item.key}>
              {showDivider && <div className="my-1.5 border-t border-hair-2" />}
              <div
                role="button"
                tabIndex={0}
                title={meta ? `${meta.tooltip} [${meta.shortcut}]` : undefined}
                onClick={(e) => onSelect(item.key, e.ctrlKey || e.metaKey)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(item.key, e.ctrlKey || e.metaKey); }}
                className={`group flex justify-between items-center px-2 py-1.5 rounded text-12.5 cursor-pointer mb-0.5 select-none ${
                  isActive
                    ? "bg-brand-dim text-brand-deep font-medium"
                    : "hover:bg-bg-2"
                }`}
              >
                {/* Left: pin button + icon + label */}
                <span className={`flex items-center gap-1.5 min-w-0 ${isActive ? "text-brand-deep" : style.icon}`}>
                  {/* Pin button (item 9) — visible on hover or when pinned */}
                  {onTogglePin && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onTogglePin(item.key); }}
                      title={isPinned ? "Unpin" : "Pin to top"}
                      className={`shrink-0 transition-opacity ${isPinned ? "opacity-100 text-brand" : "opacity-0 group-hover:opacity-60 text-ink-3 hover:text-ink-1"}`}
                    >
                      <svg width="9" height="9" viewBox="0 0 12 12" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <path d="M5 1L7 1L7 5L10 8H2L5 5Z" /><line x1="6" y1="8" x2="6" y2="11" />
                      </svg>
                    </button>
                  )}
                  {icon}
                  <span className={`truncate ${isActive ? "text-brand-deep" : "text-ink-1"}`}>
                    {item.label}
                  </span>
                </span>

                {/* Right: delta + badge + shortcut */}
                <span className="flex items-center gap-1 shrink-0">
                  {/* Delta indicator (items 16, 18) */}
                  {delta !== 0 && (
                    <span className={`text-10 font-mono font-semibold ${delta > 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {delta > 0 ? `+${delta}` : delta}
                      {delta > 0 ? "↑" : "↓"}
                    </span>
                  )}
                  {/* Count badge (items 1, 3, 7) */}
                  <span
                    className={`relative font-mono text-11 px-1.5 py-px rounded-sm transition-colors ${
                      isActive ? "bg-brand text-white" : style.badge
                    }`}
                  >
                    {style.pulse && count > 0 && !isActive && (
                      <span className="absolute inset-0 rounded-sm animate-ping opacity-30 bg-current" />
                    )}
                    {item.count}
                  </span>
                  {/* Shortcut hint (item 11) */}
                  {meta && (
                    <span className="text-9 text-ink-3 font-mono w-3 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {meta.shortcut}
                    </span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footer: last updated + save filter (items 14, 17) */}
      <div className="mt-2 pt-2 border-t border-hair-2 space-y-1.5">
        {/* Last updated timestamp (item 17) */}
        {lastRefreshed && (
          <div className="flex items-center justify-between">
            <span className="text-10 text-ink-3">
              Updated {relativeTime(lastRefreshed)}
            </span>
            {!isMulti && onSaveFilter && (
              <button
                type="button"
                onClick={() => setSaveOpen((v) => !v)}
                className="text-10 text-ink-3 hover:text-ink-1 transition-colors"
                title="Save current filter"
              >
                {saveOpen ? "Cancel" : "+ Save"}
              </button>
            )}
          </div>
        )}

        {/* Save filter input (item 14) */}
        {saveOpen && onSaveFilter && (
          <div className="flex gap-1">
            <input
              ref={saveInputRef}
              value={saveDraft}
              onChange={(e) => setSaveDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && saveDraft.trim()) {
                  onSaveFilter(saveDraft.trim());
                  setSaveDraft("");
                  setSaveOpen(false);
                }
                if (e.key === "Escape") { setSaveOpen(false); setSaveDraft(""); }
              }}
              placeholder="Name this filter…"
              className="flex-1 bg-bg-2 border border-hair-2 rounded px-1.5 py-0.5 text-11 text-ink-1 placeholder-ink-3 outline-none focus:border-brand min-w-0"
            />
            <button
              type="button"
              disabled={!saveDraft.trim()}
              onClick={() => {
                if (!saveDraft.trim()) return;
                onSaveFilter(saveDraft.trim());
                setSaveDraft("");
                setSaveOpen(false);
              }}
              className="text-10 font-semibold px-1.5 py-0.5 rounded bg-brand text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        )}

        {/* Saved filter chips (item 14) */}
        {savedFilters.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {savedFilters.map((sf) => (
              <div key={sf.id} className="flex items-center justify-between group/saved">
                <button
                  type="button"
                  onClick={() => onApplySaved?.(sf.keys)}
                  className="text-10 text-ink-2 hover:text-brand truncate max-w-[130px] text-left"
                  title={sf.keys.join(", ")}
                >
                  ⊙ {sf.label}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSaved?.(sf.id)}
                  className="opacity-0 group-hover/saved:opacity-100 text-10 text-ink-3 hover:text-red-400 transition-opacity ml-1"
                  title="Delete saved filter"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MLRO Card ─────────────────────────────────────────────────────────────

export function SidebarMLROCard() {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [role, setRole] = useState<OperatorRole>("mlro");

  useEffect(() => {
    try {
      const n = window.localStorage.getItem(OPERATOR_STORAGE_KEY);
      if (n) setName(n);
    } catch { /* localStorage disabled */ }
    setRole(loadOperatorRole());
    const sync = () => {
      setRole(loadOperatorRole());
      try {
        const n = window.localStorage.getItem(OPERATOR_STORAGE_KEY);
        setName(n ?? "");
      } catch (err) { console.warn("[hawkeye] sidebar operator-name sync read failed:", err); }
    };
    window.addEventListener("hawkeye:operator-role-updated", sync);
    window.addEventListener("hawkeye:operator-updated", sync);
    return () => {
      window.removeEventListener("hawkeye:operator-role-updated", sync);
      window.removeEventListener("hawkeye:operator-updated", sync);
    };
  }, []);

  const selectRole = (r: OperatorRole) => {
    saveOperatorRole(r);
    setRole(r);
  };

  const save = () => {
    const n = draftName.trim();
    setName(n);
    try {
      n
        ? window.localStorage.setItem(OPERATOR_STORAGE_KEY, n)
        : window.localStorage.removeItem(OPERATOR_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent("hawkeye:operator-updated"));
    } catch { /* localStorage disabled */ }
    setEditing(false);
  };

  const startEdit = () => {
    setDraftName(name);
    setEditing(true);
  };

  const initial = name ? name.charAt(0).toUpperCase() : "·";
  const inputCls =
    "w-full bg-white/15 text-white placeholder-white/40 rounded px-2 py-1 text-12 font-medium outline-none border border-white/30 focus:border-white mb-1.5";

  return (
    <div className="bg-brand text-white p-3 rounded-lg">
      {editing ? (
        <div>
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="Full name"
            className={inputCls}
          />
          <div className="text-10 uppercase tracking-wide-3 text-white/70 mb-1.5">
            Role
          </div>
          <div className="flex flex-col gap-1 mb-2">
            {CARD_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => selectRole(r)}
                className={`text-left px-2 py-1 rounded text-11 font-medium transition-colors ${
                  r === role
                    ? "bg-white text-brand"
                    : "bg-white/15 hover:bg-white/25 text-white"
                }`}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={save}
              className="text-11 font-semibold bg-white text-brand px-2 py-0.5 rounded hover:bg-white/90"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-11 font-medium text-white/80 px-2 py-0.5 rounded hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={startEdit}
            className="w-full text-left"
            title="Click to edit name"
          >
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 border border-white/60 flex items-center justify-center font-display text-[14px] font-semibold text-white leading-none shrink-0">
                {initial}
              </span>
              <span className="text-13 font-semibold truncate">
                {name || "Set your name"}
              </span>
            </div>
          </button>
          <div className="mt-2 pt-2 border-t border-white/20 flex items-center justify-between">
            <span className="text-10 uppercase tracking-wide-3 text-white/70">
              Role
            </span>
            <button
              type="button"
              onClick={() => {
                const idx = CARD_ROLES.indexOf(role);
                const next =
                  CARD_ROLES[(idx === -1 ? 0 : idx + 1) % CARD_ROLES.length]!;
                selectRole(next);
              }}
              className="inline-flex items-center gap-1 text-11 font-semibold px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 text-white border border-white/20"
              title="Click to cycle role"
            >
              {ROLE_LABEL[role]}
              <span className="text-10 opacity-75">⇄</span>
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-10 uppercase tracking-wide-3 text-white/70">
              Shift
            </span>
            <span className="text-11 font-semibold font-mono text-white/90">
              09:00–18:00
            </span>
          </div>
        </>
      )}
    </div>
  );
}
