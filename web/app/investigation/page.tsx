"use client";

import { useMemo, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";

// Investigation Canvas — link-analysis view. Subject → UBOs →
// counterparties → related cases → adverse-media URLs, all as nodes
// on one SVG canvas with curved edges. Nodes clickable; hovering
// shows metadata. Until a real graph backend is wired the layout
// draws a synthesised small graph from a seed subject for demo.

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

const DEMO_NODES: GraphNode[] = [
  { id: "sub", label: "OZCAN HALAC", kind: "subject", x: 400, y: 220 },
  { id: "ubo1", label: "UBO 1 · 60%", kind: "ubo", x: 150, y: 90 },
  { id: "ubo2", label: "UBO 2 · 25%", kind: "ubo", x: 160, y: 360 },
  { id: "cp1", label: "IGR FZCO", kind: "counterparty", x: 670, y: 100 },
  { id: "cp2", label: "Istanbul Altin Raf.", kind: "counterparty", x: 670, y: 340 },
  { id: "case1", label: "CASE-2026-598596", kind: "case", x: 420, y: 420 },
  { id: "art1", label: "Adverse-media article", kind: "article", x: 90, y: 220 },
];

const DEMO_EDGES: GraphEdge[] = [
  { from: "sub", to: "ubo1", label: "beneficial owner" },
  { from: "sub", to: "ubo2", label: "beneficial owner" },
  { from: "sub", to: "cp1", label: "transacted with" },
  { from: "sub", to: "cp2", label: "transacted with" },
  { from: "sub", to: "case1", label: "subject of" },
  { from: "sub", to: "art1", label: "mentioned in" },
];

const KIND_STYLE: Record<GraphNode["kind"], { fill: string; stroke: string; text: string; icon: string }> = {
  subject: { fill: "#fce7f3", stroke: "#ec4899", text: "#831843", icon: "◆" },
  ubo: { fill: "#ede9fe", stroke: "#8b5cf6", text: "#4c1d95", icon: "●" },
  counterparty: { fill: "#dbeafe", stroke: "#3b82f6", text: "#1e3a8a", icon: "▲" },
  case: { fill: "#fef3c7", stroke: "#f59e0b", text: "#78350f", icon: "▼" },
  article: { fill: "#fee2e2", stroke: "#ef4444", text: "#7f1d1d", icon: "◼" },
};

export default function InvestigationPage() {
  const [focus, setFocus] = useState<string | null>(null);

  const nodesById = useMemo(() => {
    const m: Record<string, GraphNode> = {};
    for (const n of DEMO_NODES) m[n.id] = n;
    return m;
  }, []);

  return (
    <ModuleLayout narrow>
      <div className="max-w-6xl mx-auto px-8 py-10">
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

        <div className="bg-bg-panel border border-hair-2 rounded-lg p-3 mt-6">
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
            {DEMO_EDGES.map((e, i) => {
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
            {DEMO_NODES.map((n) => {
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
                    strokeWidth={2}
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
                    {n.label.length > 20 ? n.label.slice(0, 18) + "…" : n.label}
                  </text>
                </g>
              );
            })}
          </svg>
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
          Click a node to isolate its relationships. The current view is demo
          data seeded from the Ozcan Halac case; a live graph backend
          (OpenCorporates / Orbis / your own entity-resolution store) wires in
          under the same shape — nodes + edges — without a UI change.
        </p>
      </div>
    </ModuleLayout>
  );
}
