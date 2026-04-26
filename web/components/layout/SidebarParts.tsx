"use client";

import type { ReactNode } from "react";
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
    <aside className="bg-bg-panel border-r border-brand/40 px-4 py-5 overflow-y-auto print:hidden">
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

export function SidebarFilterList<K extends string>({
  items,
  activeKey,
  onSelect,
}: SidebarFilterListProps<K>) {
  return (
    <ul className="list-none p-0 m-0">
      {items.map((item) => {
        const isActive = item.key === activeKey;
        return (
          <li
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={`flex justify-between items-center px-2 py-1.5 rounded text-12.5 cursor-pointer mb-0.5 ${
              isActive
                ? "bg-brand-dim text-brand-deep font-medium"
                : "hover:bg-bg-2"
            }`}
          >
            <span>{item.label}</span>
            <span
              className={`font-mono text-11 px-1.5 py-px rounded-sm ${
                isActive ? "bg-brand text-white" : "bg-bg-2 text-ink-3"
              }`}
            >
              {item.count}
            </span>
          </li>
        );
      })}
    </ul>
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
