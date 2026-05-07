"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SidebarFilterList,
  SidebarMLROCard,
  SidebarSection,
  SidebarShell,
} from "./SidebarParts";
import type { FilterKey, QueueFilter, SavedFilterSet } from "@/lib/types";

const PINNED_KEY = "hawkeye.pinned-filters";
const SAVED_KEY  = "hawkeye.saved-filter-sets";

interface SidebarProps {
  filters: QueueFilter[];
  activeFilters: FilterKey[];
  onFiltersChange: (keys: FilterKey[]) => void;
  onRefresh?: () => void;
}

export function Sidebar({ filters, activeFilters, onFiltersChange, onRefresh }: SidebarProps) {
  // --- Pinning (localStorage) ---
  const [pinnedKeys, setPinnedKeys] = useState<FilterKey[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilterSet[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PINNED_KEY);
      if (raw) setPinnedKeys(JSON.parse(raw));
    } catch (err) { console.warn("[hawkeye] sidebar pinned-filters parse failed:", err); }
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (raw) setSavedFilters(JSON.parse(raw));
    } catch (err) { console.warn("[hawkeye] sidebar saved-filters parse failed:", err); }
  }, []);

  // --- Count delta tracking ---
  const prevCountsRef = useRef<Record<string, number>>({});
  const [countDeltas, setCountDeltas] = useState<Record<string, number>>({});
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    const prev = prevCountsRef.current;
    const deltas: Record<string, number> = {};
    let anyChange = false;
    for (const f of filters) {
      const curr = parseInt(f.count, 10);
      const prevCount = prev[f.key];
      if (prevCount !== undefined) {
        const d = curr - prevCount;
        if (d !== 0) { deltas[f.key] = d; anyChange = true; }
      }
    }
    if (anyChange) {
      setCountDeltas(deltas);
      setLastRefreshed(new Date());
    } else if (lastRefreshed === null && filters.length > 0) {
      setLastRefreshed(new Date());
    }
    prevCountsRef.current = Object.fromEntries(
      filters.map((f) => [f.key, parseInt(f.count, 10)]),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // --- Auto-refresh every 30s ---
  useEffect(() => {
    if (!onRefresh) return;
    const id = setInterval(onRefresh, 30_000);
    return () => clearInterval(id);
  }, [onRefresh]);

  // --- Keyboard shortcuts (1–9) ---
  useEffect(() => {
    const SHORTCUTS: Record<string, FilterKey> = {
      "1": "all", "2": "critical", "3": "sanctions", "4": "edd",
      "5": "pep", "6": "sla", "7": "a24", "8": "mine", "9": "closed",
    };
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      const key = SHORTCUTS[e.key];
      if (key) { e.preventDefault(); onFiltersChange([key]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onFiltersChange]);

  // --- Pin toggle ---
  const togglePin = useCallback((key: FilterKey) => {
    setPinnedKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { localStorage.setItem(PINNED_KEY, JSON.stringify(next)); }
      catch (err) { console.warn("[hawkeye] sidebar pinned-filters persist failed:", err); }
      return next;
    });
  }, []);

  // --- Save current filter set ---
  const saveFilterSet = useCallback((label: string) => {
    const set: SavedFilterSet = {
      id: Date.now().toString(),
      label,
      keys: activeFilters,
      createdAt: new Date().toISOString(),
    };
    setSavedFilters((prev) => {
      const next = [...prev, set];
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); }
      catch (err) { console.warn("[hawkeye] sidebar saved-filters persist failed:", err); }
      return next;
    });
  }, [activeFilters]);

  const deleteSavedFilter = useCallback((id: string) => {
    setSavedFilters((prev) => {
      const next = prev.filter((s) => s.id !== id);
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); }
      catch (err) { console.warn("[hawkeye] sidebar saved-filters persist failed:", err); }
      return next;
    });
  }, []);

  // --- Multi-select handler ---
  const handleSelect = useCallback((key: FilterKey, multiSelect: boolean) => {
    if (multiSelect) {
      if (activeFilters.includes(key)) {
        const next = activeFilters.filter((k) => k !== key);
        onFiltersChange(next.length > 0 ? next : ["all"]);
      } else {
        onFiltersChange([...activeFilters.filter((k) => k !== "all"), key]);
      }
    } else {
      onFiltersChange([key]);
    }
  }, [activeFilters, onFiltersChange]);

  return (
    <SidebarShell>
      <SidebarSection title="Regulatory">
        <SidebarMLROCard />
      </SidebarSection>

      <SidebarSection
        title="Queue filters"
        collapsible
        actions={
          onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh counts"
              className="text-ink-3 hover:text-ink-1 transition-colors p-0.5 rounded"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.5 2A5 5 0 1 0 11 6.5" />
                <polyline points="10.5,0.5 10.5,3 8,3" />
              </svg>
            </button>
          ) : undefined
        }
      >
        <SidebarFilterList
          items={filters}
          activeKeys={activeFilters}
          onSelect={handleSelect}
          pinnedKeys={pinnedKeys}
          onTogglePin={togglePin}
          countDeltas={countDeltas}
          lastRefreshed={lastRefreshed}
          savedFilters={savedFilters}
          onSaveFilter={saveFilterSet}
          onDeleteSaved={deleteSavedFilter}
          onApplySaved={onFiltersChange}
        />
      </SidebarSection>
    </SidebarShell>
  );
}
