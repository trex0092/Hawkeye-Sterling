"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { ModuleActionBar } from "@/components/shared/ModuleActionBar";
import type { RelationshipGraph, GraphNode, GraphEdge } from "@/lib/server/relationship-graph";
import { apiErrorMessage, caughtErrorMessage } from "@/lib/client/error-utils";
import type { Subject } from "@/lib/types";

// ─── Constants ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "hawkeye.screening-subjects.v1";

const SVG_W = 800;
const SVG_H = 600;
const CENTER_X = 400;
const CENTER_Y = 300;
const NODE_R = 24;

// Node fill colors by type
const NODE_COLORS: Record<GraphNode["type"], string> = {
  subject: "#3b82f6",
  ubo: "#22c55e",
  associate: "#f97316",
  entity: "#6b7280",
  vessel: "#8b5cf6",
  aircraft: "#ec4899",
};

// ─── Layout helpers ────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

interface LayoutNode extends GraphNode {
  x: number;
  y: number;
}

/** Simple circular spring layout.
 *  Center node goes at (CENTER_X, CENTER_Y).
 *  All directly connected nodes spread on a circle around it.
 *  Secondary nodes spread on a smaller orbit around their parent. */
function computeLayout(graph: RelationshipGraph): Map<string, Point> {
  const positions = new Map<string, Point>();

  if (graph.nodes.length === 0) return positions;

  // Place center node
  positions.set(graph.centerNodeId, { x: CENTER_X, y: CENTER_Y });

  // Find direct neighbors of center
  const directNeighbors = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.from === graph.centerNodeId) directNeighbors.add(edge.to);
    if (edge.to === graph.centerNodeId) directNeighbors.add(edge.from);
  }

  // Place direct neighbors on a circle
  const directArr = Array.from(directNeighbors).filter(
    (id) => id !== graph.centerNodeId,
  );
  const primaryRadius = Math.min(180, 60 + directArr.length * 30);
  directArr.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / directArr.length - Math.PI / 2;
    positions.set(id, {
      x: CENTER_X + primaryRadius * Math.cos(angle),
      y: CENTER_Y + primaryRadius * Math.sin(angle),
    });
  });

  // Place any remaining nodes not yet positioned
  const remaining = graph.nodes
    .map((n) => n.id)
    .filter((id) => !positions.has(id));

  if (remaining.length > 0) {
    const secondaryRadius = primaryRadius + 100;
    remaining.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / remaining.length;
      positions.set(id, {
        x: CENTER_X + secondaryRadius * Math.cos(angle),
        y: CENTER_Y + secondaryRadius * Math.sin(angle),
      });
    });
  }

  // Clamp to safe SVG bounds
  for (const [id, pt] of positions) {
    positions.set(id, {
      x: Math.max(NODE_R + 4, Math.min(SVG_W - NODE_R - 4, pt.x)),
      y: Math.max(NODE_R + 16, Math.min(SVG_H - NODE_R - 20, pt.y)),
    });
  }

  return positions;
}

// ─── Sub-components ────────────────────────────────────────────────────────

function NodeCircle({
  node,
  x,
  y,
  selected,
  onClick,
}: {
  node: GraphNode;
  x: number;
  y: number;
  selected: boolean;
  onClick: () => void;
}) {
  const fill = NODE_COLORS[node.type] ?? "#6b7280";
  const isCenter = node.type === "subject";

  return (
    <g
      style={{ cursor: "pointer" }}
      onClick={onClick}
      role="button"
      aria-label={`Node: ${node.label}`}
    >
      {/* Flagged ring */}
      {node.flagged && (
        <circle
          cx={x}
          cy={y}
          r={NODE_R + 5}
          fill="none"
          stroke="#ef4444"
          strokeWidth={2.5}
          strokeDasharray="4 2"
        />
      )}
      {/* Selection ring */}
      {selected && (
        <circle
          cx={x}
          cy={y}
          r={NODE_R + 9}
          fill="none"
          stroke="#facc15"
          strokeWidth={2}
        />
      )}
      {/* Main circle */}
      <circle
        cx={x}
        cy={y}
        r={NODE_R}
        fill={fill}
        stroke={isCenter ? "#ffffff" : "rgba(255,255,255,0.2)"}
        strokeWidth={isCenter ? 2.5 : 1}
        opacity={0.9}
      />
      {/* Risk score badge */}
      {node.riskScore !== undefined && node.riskScore > 50 && (
        <>
          <circle
            cx={x + NODE_R - 6}
            cy={y - NODE_R + 6}
            r={9}
            fill="#ef4444"
            stroke="#1e293b"
            strokeWidth={1.5}
          />
          <text
            x={x + NODE_R - 6}
            y={y - NODE_R + 10}
            textAnchor="middle"
            fontSize={8}
            fontWeight="700"
            fill="#ffffff"
            style={{ userSelect: "none" }}
          >
            {node.riskScore}
          </text>
        </>
      )}
      {/* Node initials */}
      <text
        x={x}
        y={y + 5}
        textAnchor="middle"
        fontSize={13}
        fontWeight="600"
        fill="#ffffff"
        style={{ userSelect: "none" }}
      >
        {node.label.slice(0, 2).toUpperCase()}
      </text>
      {/* Node label below */}
      <text
        x={x}
        y={y + NODE_R + 14}
        textAnchor="middle"
        fontSize={10}
        fill="#94a3b8"
        style={{ userSelect: "none" }}
      >
        {node.label.length > 18 ? `${node.label.slice(0, 16)}…` : node.label}
      </text>
    </g>
  );
}

function EdgeLine({
  edge,
  fromPt,
  toPt,
}: {
  edge: GraphEdge;
  fromPt: Point;
  toPt: Point;
}) {
  const strokeWidth = Math.max(1, Math.round(edge.weight * 4));
  const midX = (fromPt.x + toPt.x) / 2;
  const midY = (fromPt.y + toPt.y) / 2;

  return (
    <g>
      <line
        x1={fromPt.x}
        y1={fromPt.y}
        x2={toPt.x}
        y2={toPt.y}
        stroke="#334155"
        strokeWidth={strokeWidth}
        strokeOpacity={0.7}
      />
      <text
        x={midX}
        y={midY - 4}
        textAnchor="middle"
        fontSize={9}
        fill="#64748b"
        style={{ userSelect: "none" }}
      >
        {edge.label}
      </text>
    </g>
  );
}

function Legend() {
  return (
    <div className="absolute bottom-4 left-4 bg-bg-panel/90 border border-hair-2 rounded-lg p-3 text-xs text-ink-1 space-y-1.5">
      <div className="text-10 font-semibold uppercase tracking-wider text-ink-3 mb-2">
        Legend
      </div>
      {(Object.entries(NODE_COLORS) as [GraphNode["type"], string][]).map(
        ([type, color]) => (
          <div key={type} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="capitalize">{type}</span>
          </div>
        ),
      )}
      <div className="border-t border-hair-2 mt-2 pt-2 space-y-1">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-red-500 border-dashed flex-shrink-0" />
          <span>Flagged / sanctioned</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full flex-shrink-0 bg-red-500"
            style={{ lineHeight: "12px", textAlign: "center", fontSize: 8, color: "white", fontWeight: 700 }}
          >
            #
          </span>
          <span>Risk score badge (&gt;50)</span>
        </div>
      </div>
    </div>
  );
}

function InfoPanel({
  node,
  onClose,
}: {
  node: GraphNode;
  onClose: () => void;
}) {
  return (
    <div className="absolute top-4 right-4 w-64 bg-bg-panel border border-hair-2 rounded-lg p-4 shadow-xl text-sm text-ink-0">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div
            className="w-4 h-4 rounded-full mb-2"
            style={{ backgroundColor: NODE_COLORS[node.type] ?? "#6b7280" }}
          />
          <div className="font-semibold text-ink-0 text-base leading-tight">
            {node.label}
          </div>
          <div className="text-ink-3 text-xs capitalize mt-0.5">
            {node.type}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-ink-3 hover:text-ink-0 ml-2 flex-shrink-0 text-lg leading-none"
          aria-label="Close info panel"
        >
          &times;
        </button>
      </div>

      <dl className="space-y-2 text-xs">
        {node.riskScore !== undefined && (
          <div className="flex justify-between">
            <dt className="text-ink-3">Risk score</dt>
            <dd
              className={`font-mono font-semibold ${
                node.riskScore >= 75
                  ? "text-red-400"
                  : node.riskScore >= 50
                    ? "text-amber-400"
                    : "text-green-400"
              }`}
            >
              {node.riskScore}
            </dd>
          </div>
        )}

        {node.jurisdiction && (
          <div className="flex justify-between">
            <dt className="text-ink-3">Jurisdiction</dt>
            <dd className="text-ink-0">{node.jurisdiction}</dd>
          </div>
        )}

        {node.pepTier && (
          <div className="flex justify-between">
            <dt className="text-ink-3">PEP tier</dt>
            <dd className="text-amber-300 font-semibold">Tier {node.pepTier}</dd>
          </div>
        )}

        {node.flagged !== undefined && (
          <div className="flex justify-between">
            <dt className="text-ink-3">Sanctions status</dt>
            <dd
              className={
                node.flagged ? "text-red-400 font-semibold" : "text-green-400"
              }
            >
              {node.flagged ? "Flagged" : "Clear"}
            </dd>
          </div>
        )}

        <div className="flex justify-between">
          <dt className="text-ink-3">Node type</dt>
          <dd className="text-ink-1 capitalize">{node.type}</dd>
        </div>
      </dl>
    </div>
  );
}

// ─── Graph Canvas ──────────────────────────────────────────────────────────

function GraphCanvas({
  graph,
  selectedNodeId,
  onSelectNode,
}: {
  graph: RelationshipGraph;
  selectedNodeId: string | null;
  onSelectNode: (_id: string | null) => void;
}) {
  const positions = computeLayout(graph);

  const layoutNodes: LayoutNode[] = graph.nodes.map((n) => {
    const pt = positions.get(n.id) ?? { x: CENTER_X, y: CENTER_Y };
    return { ...n, ...pt };
  });

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width="100%"
      style={{ display: "block", background: "#0f172a", borderRadius: "0.5rem" }}
      role="img"
      aria-label="Network relationship graph"
      onClick={(e) => {
        if ((e.target as SVGElement).tagName === "svg") onSelectNode(null);
      }}
    >
      {/* Edges — render below nodes */}
      <g>
        {graph.edges.map((edge, i) => {
          const fromPt = positions.get(edge.from);
          const toPt = positions.get(edge.to);
          if (!fromPt || !toPt) return null;
          return (
            <EdgeLine key={`edge-${i}`} edge={edge} fromPt={fromPt} toPt={toPt} />
          );
        })}
      </g>

      {/* Nodes */}
      <g>
        {layoutNodes.map((node) => (
          <NodeCircle
            key={node.id}
            node={node}
            x={node.x}
            y={node.y}
            selected={node.id === selectedNodeId}
            onClick={() =>
              onSelectNode(node.id === selectedNodeId ? null : node.id)
            }
          />
        ))}
      </g>
    </svg>
  );
}

// ─── Subject Search ────────────────────────────────────────────────────────

function SubjectSearch({
  onLoad,
  loading,
}: {
  onLoad: (_subjectId: string, _subjects: Subject[]) => void;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [filtered, setFiltered] = useState<Subject[]>([]);
  const [selected, setSelected] = useState<Subject | null>(null);

  // Load subjects from localStorage on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setAllSubjects(parsed as Subject[]);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Filter subjects by query
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setFiltered(allSubjects.slice(0, 8));
    } else {
      setFiltered(
        allSubjects
          .filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              s.id.toLowerCase().includes(q) ||
              s.meta?.toLowerCase().includes(q),
          )
          .slice(0, 8),
      );
    }
  }, [query, allSubjects]);

  function handleLoad() {
    if (!selected) return;
    onLoad(selected.id, allSubjects);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          type="text"
          placeholder="Search subjects by name or ID…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          className="w-full px-3 py-2 border border-hair-2 rounded bg-bg-panel text-sm text-ink-0 placeholder-ink-3 focus:outline-none focus:border-brand"
        />
        {query && filtered.length > 0 && !selected && (
          <ul className="absolute z-10 w-full mt-1 bg-bg-panel border border-hair-2 rounded shadow-xl max-h-48 overflow-y-auto">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  className="w-full text-left px-2.5 py-1.5 text-12 hover:bg-bg-1 text-ink-0 flex items-center justify-between"
                  onClick={() => {
                    setSelected(s);
                    setQuery(s.name);
                  }}
                >
                  <span>{s.name}</span>
                  <span className="text-xs text-ink-3 ml-2">{s.type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {allSubjects.length === 0 && (
        <p className="text-xs text-amber-400">
          No subjects loaded — open the Screening Queue first to add subjects.
        </p>
      )}

      <button
        onClick={handleLoad}
        disabled={!selected || loading}
        className="px-3 py-1.5 bg-brand hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-12 font-semibold rounded transition-colors"
      >
        {loading ? "Loading graph…" : "Load Graph"}
      </button>

      {selected && (
        <div className="text-xs text-ink-3">
          Selected:{" "}
          <span className="text-ink-0 font-semibold">{selected.name}</span>{" "}
          ({selected.id})
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function NetworkGraphPage() {
  const [graph, setGraph] = useState<RelationshipGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const selectedNode = graph?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const handleLoad = useCallback(
    async (subjectId: string, subjects: Subject[]) => {
      setLoading(true);
      setError(null);
      setGraph(null);
      setSelectedNodeId(null);

      try {
        // Encode subjects as base64 for the GET request
        const dataParam = Buffer.from(JSON.stringify(subjects)).toString(
          "base64",
        );
        const url = `/api/relationship-graph?subjectId=${encodeURIComponent(subjectId)}&data=${encodeURIComponent(dataParam)}`;

        const res = await fetch(url, { method: "GET" });
        const json = (await res.json()) as {
          ok: boolean;
          graph?: RelationshipGraph;
          error?: string;
        };

        if (!mountedRef.current) return;

        if (!json.ok || !json.graph) {
          setError(json.error ?? apiErrorMessage(res.status));
        } else {
          setGraph(json.graph);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(
            caughtErrorMessage(err, "Failed to load graph"),
          );
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [],
  );

  return (
    <>
      <Header />
      <ModuleActionBar asanaModule="network-graph" asanaLabel="Network Graph" />
      <div className="min-h-screen bg-bg-0 text-ink-0">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Page header */}
          <div className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-widest text-brand mb-1">
              Intelligence
            </div>
            <h1 className="text-28 md:text-48 font-bold text-ink-0">
              Network Relationship{" "}
              <span className="text-brand">Graph.</span>
            </h1>
            <p className="text-ink-3 text-sm mt-1">
              Visualise UBO chains, corporate structures, known associates, and
              shared addresses for any screening subject.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            {/* Left panel — search + legend */}
            <div className="space-y-6">
              <div className="bg-bg-panel border border-hair-2 rounded-xl p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-3 mb-3">
                  Subject search
                </div>
                <SubjectSearch onLoad={handleLoad} loading={loading} />
              </div>

              {/* Graph stats */}
              {graph && (
                <div className="bg-bg-panel border border-hair-2 rounded-xl p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-ink-3 mb-3">
                    Graph summary
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-ink-3">Nodes</dt>
                      <dd className="text-ink-0 font-semibold">
                        {graph.nodes.length}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-3">Edges</dt>
                      <dd className="text-ink-0 font-semibold">
                        {graph.edges.length}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-3">Flagged</dt>
                      <dd
                        className={
                          graph.nodes.some((n) => n.flagged)
                            ? "text-red-400 font-semibold"
                            : "text-emerald-400"
                        }
                      >
                        {graph.nodes.filter((n) => n.flagged).length}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-3">Generated</dt>
                      <dd className="text-ink-1 text-xs font-mono">
                        {new Date(graph.generatedAt).toLocaleTimeString("en-GB")}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>

            {/* Right panel — SVG graph canvas */}
            <div>
              {/* Error */}
              {error && (
                <div className="bg-red-950 border border-red-800 rounded-lg p-4 text-sm text-red-300 mb-4">
                  {error}
                </div>
              )}

              {/* Empty state */}
              {!graph && !loading && !error && (
                <div className="flex items-center justify-center h-[500px] bg-bg-panel border border-hair-2 rounded-xl text-ink-3 text-sm">
                  Search for a subject and click &quot;Load Graph&quot; to visualise
                  relationships.
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="flex items-center justify-center h-[500px] bg-bg-panel border border-hair-2 rounded-xl text-ink-3 text-sm">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-5 w-5 text-brand"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Building graph…
                </div>
              )}

              {/* Graph */}
              {graph && !loading && (
                <div className="relative rounded-xl overflow-hidden border border-hair-2">
                  <GraphCanvas
                    graph={graph}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={setSelectedNodeId}
                  />
                  <Legend />
                  {selectedNode && (
                    <InfoPanel
                      node={selectedNode}
                      onClose={() => setSelectedNodeId(null)}
                    />
                  )}
                </div>
              )}

              {/* Node list */}
              {graph && graph.nodes.length > 0 && (
                <div className="mt-4 bg-bg-panel border border-hair-2 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-hair-2 text-xs font-semibold uppercase tracking-wider text-ink-3">
                    All nodes
                  </div>
                  <div className="divide-y divide-hair-2">
                    {graph.nodes.map((node) => (
                      <button
                        key={node.id}
                        className={`w-full text-left px-3 py-1.5 flex items-center gap-3 hover:bg-bg-1 transition-colors ${
                          selectedNodeId === node.id ? "bg-bg-1" : ""
                        }`}
                        onClick={() =>
                          setSelectedNodeId(
                            node.id === selectedNodeId ? null : node.id,
                          )
                        }
                      >
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: NODE_COLORS[node.type] ?? "#6b7280",
                          }}
                        />
                        <span className="text-sm text-ink-0 flex-1 truncate">
                          {node.label}
                        </span>
                        <span className="text-xs text-ink-3 capitalize">
                          {node.type}
                        </span>
                        {node.flagged && (
                          <span className="text-xs text-red-400 font-semibold">
                            Flagged
                          </span>
                        )}
                        {node.riskScore !== undefined && node.riskScore > 50 && (
                          <span className="text-xs font-mono bg-red-900 text-red-300 px-1.5 py-0.5 rounded">
                            {node.riskScore}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
