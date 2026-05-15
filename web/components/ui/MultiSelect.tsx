"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface MultiSelectGroup {
  title: string;
  options: Array<{ value: string; label: string }>;
}

interface Props {
  groups: MultiSelectGroup[];
  placeholder?: string;
  value?: string[];
  onChange?: (values: string[]) => void;
}

export function MultiSelect({
  groups,
  placeholder = "Select…",
  value,
  onChange,
}: Props) {
  const [internal, setInternal] = useState<Set<string>>(
    () => new Set(value ?? []),
  );
  const selected = useMemo(
    () => (value ? new Set(value) : internal),
    [value, internal],
  );
  const setSelected = (next: Set<string>) => {
    if (onChange) onChange(Array.from(next));
    else setInternal(next);
  };

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const allOptions = useMemo(
    () => groups.flatMap((g) => g.options),
    [groups],
  );

  const triggerLabel = useMemo(() => {
    if (selected.size === 0) return placeholder;
    if (selected.size === 1) {
      const v = Array.from(selected)[0]!;
      const o = allOptions.find((x) => x.value === v);
      return o?.label ?? placeholder;
    }
    return `${selected.size} selected`;
  }, [selected, allOptions, placeholder]);

  const q = query.trim().toLowerCase();
  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          options: g.options.filter(
            (o) => !q || o.label.toLowerCase().includes(q),
          ),
        }))
        .filter((g) => g.options.length > 0),
    [groups, q],
  );

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setSelected(next);
  };

  return (
    <div className="relative w-full" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full text-left bg-transparent border border-hair-2 rounded px-3 py-2 text-13 text-ink-0 min-h-[40px] focus:outline-none focus:border-brand flex items-center pr-8 relative ${
          selected.size === 0 ? "text-ink-3" : ""
        }`}
      >
        <span className="flex-1 truncate">{triggerLabel}</span>
        <span
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 text-10 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-bg-panel border border-hair-2 rounded-lg shadow-lg max-h-[400px] flex flex-col overflow-hidden"
        >
          <div className="p-2 border-b border-hair bg-bg-1">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
              placeholder="Search…"
              aria-label="Search options"
              className="w-full px-2.5 py-1.5 text-12 bg-bg-panel border border-hair-2 rounded focus:outline-none focus:border-brand"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-1.5">
            {visibleGroups.length === 0 ? (
              <div
                role="status"
                aria-live="polite"
                className="text-11 text-ink-3 text-center py-6 uppercase tracking-wide-2 font-mono"
              >
                No options match
              </div>
            ) : (
              visibleGroups.map((g) => (
                <div key={g.title} className="mb-2 last:mb-0" role="group" aria-label={g.title}>
                  <div className="px-2 pt-1.5 pb-1 text-10 font-mono font-semibold uppercase tracking-wide-3 text-ink-3 flex items-center gap-2">
                    <span>{g.title}</span>
                    <span className="flex-1 h-px bg-hair" />
                  </div>
                  {g.options.map((o) => {
                    const on = selected.has(o.value);
                    return (
                      <button
                        type="button"
                        key={o.value}
                        role="option"
                        aria-selected={on}
                        onClick={() => toggle(o.value)}
                        className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-12 transition-colors ${
                          on
                            ? "bg-brand-dim text-brand-deep hover:bg-brand-dim"
                            : "text-ink-1 hover:bg-brand-dim"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                            on
                              ? "bg-brand border-brand"
                              : "border-hair-3 bg-bg-panel"
                          }`}
                        >
                          {on && (
                            <span className="text-white text-10 leading-none">
                              ✓
                            </span>
                          )}
                        </span>
                        <span>{o.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between px-3 py-2 bg-bg-1 border-t border-hair text-10 font-mono uppercase tracking-wide-2">
            <span className="text-ink-2">
              <strong className="text-brand">{selected.size}</strong> selected
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-ink-3 hover:text-red"
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SingleSelectProps {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SingleSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
}: SingleSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative w-full" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full text-left bg-transparent border border-hair-2 rounded px-3 py-2 text-13 min-h-[40px] focus:outline-none focus:border-brand flex items-center pr-8 relative ${
          selected ? "text-ink-0" : "text-ink-3"
        }`}
      >
        <span className="flex-1 truncate">{selected?.label ?? placeholder}</span>
        <span
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 text-10 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-bg-panel border border-hair-2 rounded-lg shadow-lg max-h-[280px] overflow-y-auto"
        >
          {options.map((o) => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-13 transition-colors ${
                  isSelected
                    ? "bg-brand-dim text-brand-deep font-medium"
                    : "text-ink-1 hover:bg-brand-dim"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
