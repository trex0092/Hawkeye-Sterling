"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  loadOperatorRole,
  saveOperatorRole,
  ROLE_LABEL,
  ALL_ROLES,
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
  const [draft, setDraft] = useState("");
  const [role, setRole] = useState<OperatorRole>("analyst");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(OPERATOR_STORAGE_KEY);
      if (stored) setName(stored);
    } catch {
      /* localStorage disabled */
    }
    setRole(loadOperatorRole());
    const onRoleChange = () => setRole(loadOperatorRole());
    window.addEventListener("hawkeye:operator-role-updated", onRoleChange);
    return () =>
      window.removeEventListener("hawkeye:operator-role-updated", onRoleChange);
  }, []);

  const toggleRole = () => {
    const next = ALL_ROLES[(ALL_ROLES.indexOf(role) + 1) % ALL_ROLES.length]!;
    saveOperatorRole(next);
    setRole(next);
  };

  const save = () => {
    const trimmed = draft.trim();
    setName(trimmed);
    try {
      if (trimmed) window.localStorage.setItem(OPERATOR_STORAGE_KEY, trimmed);
      else window.localStorage.removeItem(OPERATOR_STORAGE_KEY);
    } catch {
      /* localStorage disabled */
    }
    setEditing(false);
  };

  const startEdit = () => {
    setDraft(name);
    setEditing(true);
  };

  return (
    <div className="bg-brand text-white p-3 rounded-lg">
      {editing ? (
        <div>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="Your name"
            className="w-full bg-white/15 text-white placeholder-white/50 rounded px-2 py-1 text-13 font-semibold outline-none border border-white/30 focus:border-white"
          />
          <div className="mt-2 flex gap-1.5">
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
        <button
          type="button"
          onClick={startEdit}
          className="w-full text-left"
          title="Click to edit name"
        >
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-13 font-semibold truncate">
              {name || "Set your name"}
            </span>
          </div>
          <div className="text-11 opacity-85">On duty</div>
        </button>
      )}
      {!editing && (
        <div className="mt-2 pt-2 border-t border-white/20 flex items-center justify-between">
          <span className="text-10 uppercase tracking-wide-3 text-white/70">
            Role
          </span>
          <button
            type="button"
            onClick={toggleRole}
            className="inline-flex items-center gap-1 text-11 font-semibold px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 text-white border border-white/20"
            title="Click to cycle role (Analyst → C.Assistant → CO → MLRO → MD)"
          >
            {ROLE_LABEL[role]}
            <span className="text-10 opacity-75">⇄</span>
          </button>
        </div>
      )}
    </div>
  );
}
