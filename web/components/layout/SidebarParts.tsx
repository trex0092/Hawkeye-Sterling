"use client";

import type { JSX, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  loadOperatorRole,
  saveOperatorRole,
  ROLE_LABEL,
  CARD_ROLES,
  type OperatorRole,
} from "@/lib/data/operator-role";

const OPERATOR_STORAGE_KEY = "hawkeye.operator";

export function SidebarShell({ children }: { children: ReactNode }) {
  return (
    <aside className="bg-bg-panel border-r border-hair-2 px-4 py-5 overflow-y-auto print:hidden">
      {children}
    </aside>
  );
}

export function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="text-10.5 font-semibold tracking-wide-4 uppercase text-ink-2 mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

export interface SidebarFilterItem<K extends string> {
  key: K;
  label: string;
  count: string;
}

interface SidebarFilterListProps<K extends string> {
  items: SidebarFilterItem<K>[];
  activeKey: K;
  onSelect: (key: K) => void;
}

// --- Filter metadata: icon paths + semantic badge colors ---

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
  closed: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="5" /><polyline points="3.5,6 5.2,7.8 8.5,4.2" />
    </svg>
  ),
};

type FilterBadgeStyle = {
  icon: string;
  badge: string;
  pulse?: boolean;
};

function getFilterStyle(key: string, count: number): FilterBadgeStyle {
  if (count === 0) return { icon: "text-ink-3", badge: "bg-bg-2 text-ink-3" };
  switch (key) {
    case "critical": return { icon: "text-red-400", badge: "bg-red-500/15 text-red-400", pulse: true };
    case "sanctions": return { icon: "text-orange-400", badge: "bg-orange-500/15 text-orange-400", pulse: true };
    case "sla":       return { icon: "text-red-400",    badge: "bg-red-500/15 text-red-400", pulse: true };
    case "edd":       return { icon: "text-violet-400", badge: "bg-violet-500/15 text-violet-400" };
    case "pep":       return { icon: "text-amber-400",  badge: "bg-amber-500/15 text-amber-400" };
    case "a24":       return { icon: "text-sky-400",    badge: "bg-sky-500/15 text-sky-400" };
    case "closed":    return { icon: "text-emerald-400",badge: "bg-emerald-500/15 text-emerald-400" };
    default:          return { icon: "text-ink-2",      badge: "bg-bg-2 text-ink-2" };
  }
}

const ALL_CLEAR_KEYS = ["critical", "sanctions", "edd", "pep", "sla", "a24"];

export function SidebarFilterList<K extends string>({
  items,
  activeKey,
  onSelect,
}: SidebarFilterListProps<K>) {
  const allClear = items
    .filter((i) => ALL_CLEAR_KEYS.includes(i.key))
    .every((i) => parseInt(i.count, 10) === 0);

  return (
    <div>
      {allClear && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 mb-1 rounded bg-emerald-500/10 text-emerald-400 text-11 font-medium">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2,6 4.5,8.5 10,3.5" />
          </svg>
          Queue clear
        </div>
      )}
      <ul className="list-none p-0 m-0">
        {items.map((item, idx) => {
          const isActive = item.key === activeKey;
          const count = parseInt(item.count, 10);
          const style = getFilterStyle(item.key, count);
          const icon = FILTER_ICON[item.key];
          const isClosed = item.key === "closed";
          const prevKey = items[idx - 1]?.key;
          const showDivider = isClosed && prevKey !== undefined;

          return (
            <li key={item.key}>
              {showDivider && (
                <div className="my-1.5 border-t border-hair-2" />
              )}
              <div
                onClick={() => onSelect(item.key)}
                className={`flex justify-between items-center px-2 py-1.5 rounded text-12.5 cursor-pointer mb-0.5 group ${
                  isActive
                    ? "bg-brand-dim text-brand-deep font-medium"
                    : "hover:bg-bg-2"
                }`}
              >
                <span className={`flex items-center gap-1.5 ${isActive ? "text-brand-deep" : style.icon}`}>
                  {icon}
                  <span className={isActive ? "text-brand-deep" : "text-ink-1"}>{item.label}</span>
                </span>
                <span
                  className={`relative font-mono text-11 px-1.5 py-px rounded-sm transition-colors ${
                    isActive
                      ? "bg-brand text-white"
                      : style.badge
                  }`}
                >
                  {style.pulse && count > 0 && !isActive && (
                    <span className="absolute inset-0 rounded-sm animate-ping opacity-30 bg-current" />
                  )}
                  {item.count}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

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
      } catch { /* ignore */ }
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
