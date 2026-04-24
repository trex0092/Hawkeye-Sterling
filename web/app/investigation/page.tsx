"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { loadCases } from "@/lib/data/case-store";
import type { CaseRecord } from "@/lib/types";

// Investigation Canvas — link-analysis view. Subject → UBOs →
// counterparties → related cases → adverse-media URLs, all as nodes
// on one SVG canvas with curved edges. Nodes clickable; hovering
// shows metadata.

interface GraphNode {
  id: string;
  label: string;
  kind: "subject" | "ubo" | "counterparty" | "case" | "article";
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

const KIND_STYLE: Record<
  GraphNode["kind"],
  { fill: string; stroke: string; text: string; icon: string }
> = {
  subject:     { fill: "#fce7f3", stroke: "#ec4899", text: "#831843", icon: "◆" },
  ubo:         { fill: "#ede9fe", stroke: "#8b5cf6", text: "#4c1d95", icon: "●" },
  counterparty:{ fill: "#dbeafe", stroke: "#3b82f6", text: "#1e3a8a", icon: "▲" },
  case:        { fill: "#fef3c7", stroke: "#f59e0b", text: "#78350f", icon: "▼" },
  article:     { fill: "#fee2e2", stroke: "#ef4444", text: "#7f1d1d", icon: "◼" },
};

// ── Demo data (Ozcan Halac) ────────────────────────────────────────────────
const DEMO_NODES: GraphNode[] = [
  { id: "sub",   label: "OZCAN HALAC",         kind: "subject",      x: 400, y: 220 },
  { id: "ubo1",  label: "UBO 1 · 60%",         kind: "ubo",          x: 150, y:  90 },
  { id: "ubo2",  label: "UBO 2 · 25%",         kind: "ubo",          x: 160, y: 360 },
  { id: "cp1",   label: "IGR FZCO",             kind: "counterparty", x: 670, y: 100 },
  { id: "cp2",   label: "Istanbul Altin Raf.",  kind: "counterparty", x: 670, y: 340 },
  { id: "case1", label: "CASE-2026-598596",     kind: "case",         x: 420, y: 420 },
  { id: "art1",  label: "Adverse-media article",kind: "article",      x:  90, y: 220 },
];
const DEMO_EDGES: GraphEdge[] = [
  { from: "sub", to: "ubo1",  label: "beneficial owner" },
  { from: "sub", to: "ubo2",  label: "beneficial owner" },
  { from: "sub", to: "cp1",   label: "transacted with"  },
  { from: "sub", to: "cp2",   label: "transacted with"  },
  { from: "sub", to: "case1", label: "subject of"       },
  { from: "sub", to: "art1",  label: "mentioned in"     },
];

// ── Graph builder from live case data ─────────────────────────────────────
function buildGraph(
  name: string,
  cases: CaseRecord[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const matched = cases.filter(
    (c) => c.subject.toLowerCase() === name.toLowerCase(),
  );

  const nodes: GraphNode[] = [
    { id: "sub", label: name.toUpperCase(), kind: "subject", x: 400, y: 240 },
  ];
  const edges: GraphEdge[] = [];

  const cols = matched.length;
  matched.forEach((c, i) => {
    // Spread case nodes in a semi-circle below the subject
    const angle = cols === 1 ? Math.PI / 2 : (Math.PI / (cols - 1)) * i;
    const r = 180;
    const x = Math.round(400 + r * Math.cos(Math.PI - angle));
    const y = Math.round(240 + r * Math.sin(angle) * 0.9 + 60);
    nodes.push({ id: c.id, label: c.id, kind: "case", x, y });
    edges.push({ from: "sub", to: c.id, label: "subject of" });
  });

  return { nodes, edges };
}

type SearchKind = "entity" | "individual";

// ── Component ──────────────────────────────────────────────────────────────
export default function InvestigationPage() {
  const [focus, setFocus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState<string | null>(null); // the active subject
  const [searchKind, setSearchKind] = useState<SearchKind>("entity");
  const [committedKind, setCommittedKind] = useState<SearchKind>("entity");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [allCases, setAllCases] = useState<CaseRecord[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load cases from localStorage on mount
  useEffect(() => {
    setAllCases(loadCases());
  }, []);

  // Unique subject names from case store for autocomplete
  const knownSubjects = useMemo(() => {
    const names = new Set(allCases.map((c) => c.subject));
    return Array.from(names).sort();
  }, [allCases]);

  // Filtered suggestions as user types
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return knownSubjects.slice(0, 8);
    return knownSubjects
      .filter((n) => n.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, knownSubjects]);

  // Resolved graph
  const { nodes, edges } = useMemo<{ nodes: GraphNode[]; edges: GraphEdge[] }>(() => {
    if (!committed) return { nodes: DEMO_NODES, edges: DEMO_EDGES };
    return buildGraph(committed, allCases);
  }, [committed, allCases]);

  const nodesById = useMemo(() => {
    const m: Record<string, GraphNode> = {};
    for (const n of nodes) m[n.id] = n;
    return m;
  }, [nodes]);

  function submit(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCommitted(trimmed);
    setCommittedKind(searchKind);
    setQuery(trimmed);
    setShowSuggestions(false);
    setFocus(null);
  }

  function clearSearch() {
    setCommitted(null);
    setQuery("");
    setFocus(null);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  return (
    <ModuleLayout>
      <div>
        <ModuleHero
          eyebrow="Module 12 · Link Analysis"
          title="Investigation"
          titleEm="canvas."
          intro={
            <>
              <strong>Subject → UBO → counterparty → case → article.</strong>{" "}
              Every entity the brain has seen around a subject rendered on one
              SVG canvas. Click a node to focus the relationship; real graph
              backend (OpenCorporates / Orbis) wires in next.
            </>
          }
        />

        {/* ── Search bar ──────────────────────────────────────────────── */}
        <div className="relative mt-6 mb-4">
          <div className="flex gap-2 items-center">

            {/* Entity / Individual toggle */}
            <div className="flex rounded border border-hair-2 overflow-hidden shrink-0">
              {(["entity", "individual"] as SearchKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSearchKind(k)}
                  className={`px-3 py-2 font-mono text-10.5 font-medium transition-colors ${
                    searchKind === k
                      ? "bg-brand text-white"
                      : "bg-bg-panel text-ink-2 hover:bg-bg-1"
                  }`}
                >
                  {k === "entity" ? "Entity" : "Individual"}
                </button>
              ))}
            </div>

            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                placeholder={
                  searchKind === "entity"
                    ? "Search company or organisation name…"
                    : "Search individual name…"
                }
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit(query);
                  if (e.key === "Escape") setShowSuggestions(false);
                }}
                className="w-full font-mono text-11 bg-bg-panel border border-hair-2 rounded px-3 py-2 text-ink-1 placeholder:text-ink-4 focus:outline-none focus:border-brand"
              />
              {/* suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-bg-panel border border-hair-2 rounded shadow-lg overflow-hidden">
                  {suggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onMouseDown={() => submit(name)}
                      className="w-full text-left px-3 py-2 font-mono text-11 text-ink-1 hover:bg-brand-dim hover:text-brand-deep transition-colors"
                    >
                      <span className="text-ink-4 mr-2">
                        {searchKind === "entity" ? "⬡" : "◉"}
                      </span>
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => submit(query)}
              className="font-mono text-10.5 uppercase tracking-wide-3 font-medium px-4 py-2 rounded border cursor-pointer bg-brand text-white border-brand hover:bg-brand-hover"
            >
              Search
            </button>

            {committed && (
              <button
                type="button"
                onClick={clearSearch}
                className="font-mono text-10.5 uppercase tracking-wide-3 font-medium px-4 py-2 rounded border cursor-pointer bg-bg-panel text-ink-2 border-hair-2 hover:border-hair-3"
              >
                Demo
              </button>
            )}
          </div>

          {committed && (
            <p className="mt-1.5 text-10 font-mono text-ink-3">
              <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold mr-2 ${
                committedKind === "entity"
                  ? "bg-blue-dim text-blue"
                  : "bg-violet-dim text-violet"
              }`}>
                {committedKind}
              </span>
              Showing graph for{" "}
              <span className="text-ink-1 font-semibold">{committed}</span>
              {" · "}
              {edges.length} connection{edges.length !== 1 ? "s" : ""} found
              {edges.length === 0 && (
                <span className="text-ink-3">
                  {" "}— no cases on record; subject node shown as anchor
                </span>
              )}
            </p>
          )}
        </div>

        {/* ── Canvas ──────────────────────────────────────────────────── */}
        <div className="bg-bg-panel border border-hair-2 rounded-lg p-3">
          <svg
            width="100%"
            viewBox="0 0 800 500"
            preserveAspectRatio="xMidYMid meet"
            style={{ maxHeight: 520 }}
          >
            <defs>
              <marker
                id="arr"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="#9ca3af" />
              </marker>
            </defs>

            {edges.map((e, i) => {
              const a = nodesById[e.from]!;
              const b = nodesById[e.to]!;
              const faded = focus && focus !== a.id && focus !== b.id;
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2;
              return (
                <g key={i} style={{ opacity: faded ? 0.15 : 1 }}>
                  <path
                    d={`M ${a.x} ${a.y} Q ${mx} ${my + 30} ${b.x} ${b.y}`}
                    fill="none"
                    stroke="#9ca3af"
                    strokeWidth={1}
                    markerEnd="url(#arr)"
                  />
                  {e.label && (
                    <text
                      x={mx}
                      y={my + 18}
                      textAnchor="middle"
                      className="font-mono"
                      style={{ fontSize: 9, fill: "#6b7280" }}
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}

            {nodes.map((n) => {
              const style = KIND_STYLE[n.kind];
              const faded = focus && focus !== n.id;
              return (
                <g
                  key={n.id}
                  onClick={() => setFocus(focus === n.id ? null : n.id)}
                  style={{ cursor: "pointer", opacity: faded ? 0.3 : 1 }}
                >
                  <rect
                    x={n.x - 75}
                    y={n.y - 20}
                    width={150}
                    height={40}
                    rx={6}
                    fill={style.fill}
                    stroke={style.stroke}
                    strokeWidth={focus === n.id ? 3 : 2}
                  />
                  <text
                    x={n.x - 60}
                    y={n.y + 4}
                    style={{ fontSize: 14, fill: style.stroke }}
                  >
                    {style.icon}
                  </text>
                  <text
                    x={n.x - 40}
                    y={n.y + 4}
                    style={{ fontSize: 11, fill: style.text, fontWeight: 600 }}
                  >
                    {n.label.length > 20
                      ? n.label.slice(0, 18) + "…"
                      : n.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-3 text-10 font-mono text-ink-3">
            {Object.entries(KIND_STYLE).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span style={{ color: v.stroke, fontSize: 14 }}>{v.icon}</span>
                <span className="capitalize text-ink-2">{k}</span>
              </span>
            ))}
          </div>
        </div>

        <p className="text-11 text-ink-3 mt-3 leading-relaxed">
          {committed
            ? "Case nodes are loaded from your local case register. UBO and counterparty nodes appear when the subject is open in the screening queue."
            : "Search for any subject to see their case graph, or click a node to isolate its relationships. The default view is demo data (Ozcan Halac)."}
        </p>
      </div>
    </ModuleLayout>
  );
}
