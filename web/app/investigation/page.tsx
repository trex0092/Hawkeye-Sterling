"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { loadCases } from "@/lib/data/case-store";
import type { CaseRecord } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeKind = "subject" | "ubo" | "counterparty" | "case" | "article" | "ai_discovered";

interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  x: number;
  y: number;
  pinned?: boolean;
  confidence?: number;
  reasoning?: string;
  relationship?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  suggested?: boolean;
  suggestedId?: string;
}

interface BrainAnalysis {
  narrative: string;
  typologies: string[];
  keyRelationships: string[];
  nextSteps: string[];
  riskLevel: "critical" | "high" | "medium" | "low";
}

interface SuggestedLink {
  fromId: string;
  toId: string;
  linkType: string;
  confidence: number;
  reasoning: string;
  fatfRef: string;
}

interface DiscoverLinksResult {
  ok: boolean;
  suggestedLinks: SuggestedLink[];
  networkRiskScore: number;
  summary: string;
}

interface EvidencePackResult {
  ok: boolean;
  caseOverview: string;
  entityProfiles: Record<string, string>;
  networkNarrative: string;
  evidencePoints: string[];
  nextSteps: string[];
  regulatoryBasis: string;
  generatedAt: string;
}

type SearchKind = "entity" | "individual";

// ── Node visual config ────────────────────────────────────────────────────────

const KIND_CFG: Record<NodeKind, { stroke: string; fill: string; text: string; badge: string; icon: string; dash?: string }> = {
  subject:      { stroke: "#f472b6", fill: "#2d1524", text: "#fce7f3", badge: "#f472b6", icon: "◆", dash: "" },
  ubo:          { stroke: "#a78bfa", fill: "#1e1530", text: "#ede9fe", badge: "#a78bfa", icon: "●", dash: "" },
  counterparty: { stroke: "#60a5fa", fill: "#0f1e30", text: "#dbeafe", badge: "#60a5fa", icon: "▲", dash: "" },
  case:         { stroke: "#fbbf24", fill: "#1f1800", text: "#fef3c7", badge: "#fbbf24", icon: "▼", dash: "" },
  article:      { stroke: "#f87171", fill: "#1f0a0a", text: "#fee2e2", badge: "#f87171", icon: "◼", dash: "" },
  ai_discovered:{ stroke: "#34d399", fill: "#021f14", text: "#d1fae5", badge: "#34d399", icon: "✦", dash: "6 3" },
};

const NODE_W = 154;
const NODE_H = 42;

// ── Demo data ────────────────────────────────────────────────────────────────

const DEMO_NODES: GraphNode[] = [
  { id: "sub",   label: "OZCAN HALAC",          kind: "subject",      x: 420, y: 260 },
  { id: "ubo1",  label: "UBO 1 · 60%",          kind: "ubo",          x: 130, y: 110 },
  { id: "ubo2",  label: "UBO 2 · 25%",          kind: "ubo",          x: 130, y: 400 },
  { id: "cp1",   label: "IGR FZCO",              kind: "counterparty", x: 720, y: 110 },
  { id: "cp2",   label: "Halac Holding FZE",     kind: "counterparty", x: 720, y: 400 },
  { id: "case1", label: "CASE-2026-598596",      kind: "case",         x: 420, y: 460 },
  { id: "art1",  label: "Adverse media",         kind: "article",      x: 80,  y: 260 },
];
const DEMO_EDGES: GraphEdge[] = [
  { from: "sub",  to: "ubo1",  label: "beneficial owner" },
  { from: "sub",  to: "ubo2",  label: "beneficial owner" },
  { from: "sub",  to: "cp1",   label: "director of" },
  { from: "sub",  to: "cp2",   label: "controls" },
  { from: "sub",  to: "case1", label: "subject of" },
  { from: "sub",  to: "art1",  label: "mentioned in" },
];

// ── Graph builder ─────────────────────────────────────────────────────────────

function buildGraph(name: string, cases: CaseRecord[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const matched = cases.filter((c) => c.subject.toLowerCase() === name.toLowerCase());
  const nodes: GraphNode[] = [{ id: "sub", label: name.toUpperCase(), kind: "subject", x: 420, y: 260 }];
  const edges: GraphEdge[] = [];
  const total = matched.length;
  matched.forEach((c, i) => {
    const angle = total <= 1 ? -Math.PI / 2 : -Math.PI / 2 + (2 * Math.PI / total) * i;
    const r = 200;
    nodes.push({ id: c.id, label: c.id, kind: "case", x: Math.round(420 + r * Math.cos(angle)), y: Math.round(260 + r * Math.sin(angle)) });
    edges.push({ from: "sub", to: c.id, label: "subject of" });
  });
  return { nodes, edges };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvestigationPage() {
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState<string | null>(null);
  const [searchKind, setSearchKind] = useState<SearchKind>("entity");
  const [committedKind, setCommittedKind] = useState<SearchKind>("entity");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [allCases, setAllCases] = useState<CaseRecord[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Canvas state
  const [nodes, setNodes] = useState<GraphNode[]>(DEMO_NODES);
  const [edges, setEdges] = useState<GraphEdge[]>(DEMO_EDGES);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Zoom/pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Drag state
  const dragging = useRef<{ id: string; ox: number; oy: number } | null>(null);

  // AI Discover state
  const [discovering, setDiscovering] = useState(false);
  const [discoverCount, setDiscoverCount] = useState(0);

  // Brain analysis
  const [brainAnalysis, setBrainAnalysis] = useState<BrainAnalysis | null>(null);
  const [brainLoading, setBrainLoading] = useState(false);

  // AI Discover Links state
  const [discoveringLinks, setDiscoveringLinks] = useState(false);
  const [suggestedLinks, setSuggestedLinks] = useState<SuggestedLink[]>([]);
  const [dismissedLinkIds, setDismissedLinkIds] = useState<Set<string>>(new Set());
  const [networkRiskScore, setNetworkRiskScore] = useState<number | null>(null);
  const [discoverLinksSummary, setDiscoverLinksSummary] = useState<string | null>(null);

  // Evidence pack state
  const [exportingPack, setExportingPack] = useState(false);
  const [evidencePack, setEvidencePack] = useState<EvidencePackResult | null>(null);
  const [showEvidencePack, setShowEvidencePack] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["caseOverview"]));

  useEffect(() => { setAllCases(loadCases()); }, []);

  const knownSubjects = useMemo(() => Array.from(new Set(allCases.map((c) => c.subject))).sort(), [allCases]);
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? knownSubjects.filter((n) => n.toLowerCase().includes(q)) : knownSubjects;
    return pool.slice(0, 8);
  }, [query, knownSubjects]);

  const nodesById = useMemo(() => {
    const m: Record<string, GraphNode> = {};
    for (const n of nodes) m[n.id] = n;
    return m;
  }, [nodes]);

  // Build edges including accepted suggested links
  const activeSuggestedLinkEdges = useMemo<GraphEdge[]>(() => {
    return suggestedLinks
      .filter((sl) => {
        const sid = `${sl.fromId}|${sl.toId}`;
        return !dismissedLinkIds.has(sid);
      })
      .map((sl) => ({
        from: sl.fromId,
        to: sl.toId,
        label: sl.linkType.replace(/_/g, " "),
        suggested: true,
        suggestedId: `${sl.fromId}|${sl.toId}`,
      }));
  }, [suggestedLinks, dismissedLinkIds]);

  const allEdges = useMemo(() => [...edges, ...activeSuggestedLinkEdges], [edges, activeSuggestedLinkEdges]);

  function submit(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { nodes: n, edges: e } = buildGraph(trimmed, allCases);
    setNodes(n); setEdges(e);
    setCommitted(trimmed); setCommittedKind(searchKind);
    setQuery(trimmed); setShowSuggestions(false);
    setSelectedId(null); setDiscoverCount(0);
    setBrainAnalysis(null);
    setSuggestedLinks([]); setDismissedLinkIds(new Set());
    setNetworkRiskScore(null); setDiscoverLinksSummary(null);
    setEvidencePack(null); setShowEvidencePack(false);
  }

  function clearSearch() {
    setNodes(DEMO_NODES); setEdges(DEMO_EDGES);
    setCommitted(null); setQuery(""); setSelectedId(null);
    setDiscoverCount(0); setBrainAnalysis(null);
    setSuggestedLinks([]); setDismissedLinkIds(new Set());
    setNetworkRiskScore(null); setDiscoverLinksSummary(null);
    setEvidencePack(null); setShowEvidencePack(false);
    inputRef.current?.focus();
  }

  // ── Zoom / Pan ───────────────────────────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(3, Math.max(0.3, z - e.deltaY * 0.001)));
  }, []);

  const onSvgMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).closest("[data-node]")) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    panOrigin.current = { ...pan };
  }, [pan]);

  const onSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragging.current) {
      const id = dragging.current.id;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const svgX = (e.clientX - rect.left - pan.x) / zoom;
      const svgY = (e.clientY - rect.top - pan.y) / zoom;
      setNodes((prev) => prev.map((n) => n.id === id ? { ...n, x: Math.round(svgX), y: Math.round(svgY) } : n));
      return;
    }
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panOrigin.current.x + dx, y: panOrigin.current.y + dy });
    }
  }, [pan, zoom]);

  const onSvgMouseUp = useCallback(() => {
    isPanning.current = false;
    dragging.current = null;
  }, []);

  const onNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    dragging.current = { id, ox: e.clientX, oy: e.clientY };
  }, []);

  // ── AI Entity Discovery ───────────────────────────────────────────────────

  const runDiscover = useCallback(async () => {
    const subject = committed ?? "OZCAN HALAC";
    setDiscovering(true);
    try {
      const res = await fetch("/api/investigation-expand", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject,
          knownNodes: nodes.map((n) => n.label),
          knownEdges: edges.map((e) => ({ from: nodesById[e.from]?.label ?? e.from, to: nodesById[e.to]?.label ?? e.to, label: e.label })),
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean; discovered: Array<{ label: string; kind: string; relationship: string; confidence: number; reasoning: string }> };
      if (!data.ok || !data.discovered?.length) return;

      const subjectNode = nodes.find((n) => n.kind === "subject") ?? nodes[0];
      const cx = subjectNode?.x ?? 420;
      const cy = subjectNode?.y ?? 260;

      const newNodes: GraphNode[] = [];
      const newEdges: GraphEdge[] = [];
      const existing = new Set(nodes.map((n) => n.label.toLowerCase()));

      data.discovered.forEach((d, i) => {
        if (existing.has(d.label.toLowerCase())) return;
        const angle = (2 * Math.PI / data.discovered.length) * i - Math.PI / 4;
        const r = 280 + (i % 2 === 0 ? 0 : 60);
        const id = `ai_${Date.now()}_${i}`;
        newNodes.push({ id, label: d.label, kind: "ai_discovered", x: Math.round(cx + r * Math.cos(angle)), y: Math.round(cy + r * Math.sin(angle)), confidence: d.confidence, reasoning: d.reasoning, relationship: d.relationship });
        newEdges.push({ from: "sub", to: id, label: d.relationship });
      });

      setNodes((prev) => [...prev, ...newNodes]);
      setEdges((prev) => [...prev, ...newEdges]);
      setDiscoverCount((c) => c + newNodes.length);
    } catch { /* silent */ }
    finally { setDiscovering(false); }
  }, [committed, nodes, edges, nodesById]);

  // ── AI Discover Links ─────────────────────────────────────────────────────

  const runDiscoverLinks = useCallback(async () => {
    setDiscoveringLinks(true);
    setSuggestedLinks([]);
    setDismissedLinkIds(new Set());
    setNetworkRiskScore(null);
    setDiscoverLinksSummary(null);
    try {
      const entities = nodes.map((n) => ({
        id: n.id,
        name: n.label,
        type: n.kind,
        jurisdiction: undefined as string | undefined,
        riskScore: n.confidence ?? (n.kind === "subject" ? 80 : n.kind === "ai_discovered" ? 65 : 50),
      }));
      const existingLinks = edges.map((e) => ({
        from: e.from,
        to: e.to,
        type: e.label ?? "linked",
      }));
      const res = await fetch("/api/investigation/discover-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entities, existingLinks }),
      });
      if (!res.ok) return;
      const data = await res.json() as DiscoverLinksResult;
      if (!data.ok) return;
      setSuggestedLinks(data.suggestedLinks ?? []);
      setNetworkRiskScore(data.networkRiskScore ?? null);
      setDiscoverLinksSummary(data.summary ?? null);
    } catch { /* silent */ }
    finally { setDiscoveringLinks(false); }
  }, [nodes, edges]);

  const addSuggestedLink = useCallback((sl: SuggestedLink) => {
    const newEdge: GraphEdge = {
      from: sl.fromId,
      to: sl.toId,
      label: sl.linkType.replace(/_/g, " "),
    };
    setEdges((prev) => [...prev, newEdge]);
    const sid = `${sl.fromId}|${sl.toId}`;
    setDismissedLinkIds((prev) => new Set([...prev, sid]));
  }, []);

  const dismissSuggestedLink = useCallback((sl: SuggestedLink) => {
    const sid = `${sl.fromId}|${sl.toId}`;
    setDismissedLinkIds((prev) => new Set([...prev, sid]));
  }, []);

  // ── Brain Analysis ────────────────────────────────────────────────────────

  const matchedCases = useMemo(() => {
    if (!committed) return [];
    return allCases.filter((c) => c.subject.toLowerCase() === committed.toLowerCase());
  }, [committed, allCases]);

  const analyzeSubject = useCallback(async () => {
    if (!committed) return;
    setBrainLoading(true); setBrainAnalysis(null);
    try {
      const caseList = matchedCases.map((c) => c.id).join(", ") || "none on record";
      const question = `Generate a link-analysis investigation brief for subject ${committed}. Connected cases: ${caseList}. What typologies are indicated? What relationships should be investigated next? What is the overall risk level?`;
      const res = await fetch("/api/mlro-advisor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, subjectName: committed, entityType: committedKind === "entity" ? "organisation" : "individual", mode: "forensic", audience: "mlro" }) });
      let narrative = "";
      if (res.ok) { const d = await res.json() as { narrative?: string }; narrative = d.narrative ?? ""; }
      const lower = narrative.toLowerCase();
      const riskLevel: BrainAnalysis["riskLevel"] = lower.includes("critical") || lower.includes("immediate") ? "critical" : lower.includes("high risk") || lower.includes("significant") ? "high" : lower.includes("low risk") || lower.includes("minimal") ? "low" : "medium";
      setBrainAnalysis({ narrative: narrative || "No narrative generated.", typologies: ["Layering", "Structuring"], keyRelationships: matchedCases.length > 0 ? [`${matchedCases.length} case${matchedCases.length !== 1 ? "s" : ""} on record`] : ["No cases on record"], nextSteps: ["Review all connected entities", "Escalate if typology signals confirmed"], riskLevel });
    } catch { /* silent */ }
    finally { setBrainLoading(false); }
  }, [committed, committedKind, matchedCases]);

  // ── Evidence Pack Export ──────────────────────────────────────────────────

  const runExportPack = useCallback(async () => {
    setExportingPack(true);
    setEvidencePack(null);
    setShowEvidencePack(false);
    try {
      const caseTitle = committed ? `Investigation: ${committed}` : "Investigation Canvas Export";
      const entitiesPayload = nodes.map((n) => ({
        id: n.id,
        name: n.label,
        kind: n.kind,
        riskScore: n.confidence ?? (n.kind === "subject" ? 80 : n.kind === "ai_discovered" ? 65 : 50),
        confidence: n.confidence,
        relationship: n.relationship,
        reasoning: n.reasoning,
      }));
      const linksPayload = allEdges.map((e) => ({
        from: nodesById[e.from]?.label ?? e.from,
        to: nodesById[e.to]?.label ?? e.to,
        label: e.label,
        suggested: e.suggested ?? false,
      }));
      const narrative = brainAnalysis?.narrative ?? "";
      const res = await fetch("/api/investigation/evidence-pack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseTitle, entities: entitiesPayload, links: linksPayload, narrative, analyst: "Hawkeye Sterling Analyst" }),
      });
      if (!res.ok) return;
      const data = await res.json() as EvidencePackResult;
      if (!data.ok) return;
      setEvidencePack(data);
      setShowEvidencePack(true);
      setExpandedSections(new Set(["caseOverview"]));
    } catch { /* silent */ }
    finally { setExportingPack(false); }
  }, [committed, nodes, allEdges, nodesById, brainAnalysis]);

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const selectedNode = selectedId ? nodesById[selectedId] : null;
  const riskCls = { critical: "bg-red text-white", high: "bg-red-dim text-red", medium: "bg-amber-dim text-amber", low: "bg-green-dim text-green" };
  const networkRiskCls = networkRiskScore != null
    ? networkRiskScore >= 80 ? "bg-red text-white" : networkRiskScore >= 60 ? "bg-red-dim text-red" : networkRiskScore >= 40 ? "bg-amber-dim text-amber" : "bg-green-dim text-green"
    : "";

  const visibleSuggestedLinks = suggestedLinks.filter((sl) => !dismissedLinkIds.has(`${sl.fromId}|${sl.toId}`));
  const confirmedFromSuggested = suggestedLinks.filter((sl) => {
    const sid = `${sl.fromId}|${sl.toId}`;
    return dismissedLinkIds.has(sid) && edges.some((e) => e.from === sl.fromId && e.to === sl.toId);
  });

  return (
    <ModuleLayout asanaModule="investigation" asanaLabel="Investigation">
      <ModuleHero
        moduleNumber={41}
        eyebrow="Module 12 · Link Analysis"
        title="Investigation"
        titleEm="canvas."
        intro={<><strong>Drag nodes · scroll to zoom · AI entity discovery.</strong> Subject → UBO → counterparty → case → article on a live canvas. Hit <em>AI Discover</em> to surface connected entities using Claude link-analysis intelligence.</>}
      />

      {/* Search bar */}
      <div className="relative mt-4 mb-3">
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex rounded border border-hair-2 overflow-hidden shrink-0">
            {(["entity", "individual"] as SearchKind[]).map((k) => (
              <button key={k} type="button" onClick={() => setSearchKind(k)}
                className={`px-3 py-2 font-mono text-10.5 font-medium transition-colors ${searchKind === k ? "bg-brand text-white" : "bg-bg-panel text-ink-2 hover:bg-bg-1"}`}>
                {k === "entity" ? "Entity" : "Individual"}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <input ref={inputRef} type="text" value={query}
              placeholder={searchKind === "entity" ? "Company or organisation name…" : "Individual name…"}
              onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(query); if (e.key === "Escape") setShowSuggestions(false); }}
              className="w-full font-mono text-11 bg-bg-panel border border-hair-2 rounded px-3 py-2 text-ink-1 placeholder:text-ink-4 focus:outline-none focus:border-brand" />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-bg-panel border border-hair-2 rounded shadow-lg overflow-hidden">
                {suggestions.map((name) => (
                  <button key={name} type="button" onMouseDown={() => submit(name)}
                    className="w-full text-left px-3 py-2 font-mono text-11 text-ink-1 hover:bg-brand-dim hover:text-brand-deep transition-colors">
                    <span className="text-ink-4 mr-2">{searchKind === "entity" ? "⬡" : "◉"}</span>{name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Search */}
          <button type="button" onClick={() => submit(query)} title="Search entity or case"
            className="w-8 h-8 flex items-center justify-center rounded bg-brand text-white hover:opacity-90 text-15 shrink-0">
            ⌕
          </button>
          {/* AI Discover */}
          <button type="button" onClick={() => void runDiscover()} disabled={discovering} title="AI Discover — surface connected entities"
            className="w-8 h-8 flex items-center justify-center rounded border border-green/50 bg-green/10 text-green hover:bg-green/20 disabled:opacity-40 transition-colors shrink-0 relative text-14 font-bold">
            {discovering ? <span className="text-10 animate-pulse">…</span> : "✦"}
            {discoverCount > 0 && !discovering && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-green text-white text-8 font-bold flex items-center justify-center leading-none">
                {discoverCount}
              </span>
            )}
          </button>
          {/* AI Discover Links */}
          <button type="button" onClick={() => void runDiscoverLinks()} disabled={discoveringLinks} title="Discover relationship links + network risk score"
            className="w-8 h-8 flex items-center justify-center rounded border border-violet/50 bg-violet/10 text-violet hover:bg-violet/20 disabled:opacity-40 transition-colors shrink-0 relative text-15">
            {discoveringLinks ? <span className="text-10 animate-pulse">…</span> : "🕸"}
            {networkRiskScore != null && !discoveringLinks && (
              <span className={`absolute -top-1.5 -right-1.5 px-1 h-4 rounded-full text-8 font-bold flex items-center justify-center leading-none ${networkRiskCls}`}>
                {networkRiskScore}
              </span>
            )}
          </button>
          {/* Export Evidence Pack */}
          <button type="button" onClick={() => void runExportPack()} disabled={exportingPack} title="Export evidence pack (PDF + JSON)"
            className="w-8 h-8 flex items-center justify-center rounded border border-amber/50 bg-amber/10 text-amber hover:bg-amber/20 disabled:opacity-40 transition-colors shrink-0 text-15">
            {exportingPack ? <span className="text-10 animate-pulse">…</span> : "📤"}
          </button>
          {/* Demo */}
          {committed && (
            <button type="button" onClick={clearSearch} title="Clear / reset demo graph"
              className="w-8 h-8 flex items-center justify-center rounded border border-hair-2 text-ink-3 hover:text-ink-1 hover:border-hair-3 transition-colors shrink-0 text-12">
              ▶
            </button>
          )}
        </div>
        {committed && (
          <p className="mt-1.5 text-10 font-mono text-ink-3">
            <span className={`inline-flex items-center px-1.5 py-px rounded-sm font-mono text-10 font-semibold mr-2 ${committedKind === "entity" ? "bg-blue-dim text-blue" : "bg-violet-dim text-violet"}`}>{committedKind}</span>
            <span className="text-ink-1 font-semibold">{committed}</span>
            {" · "}{nodes.length} nodes · {edges.length} connections
            {discoverCount > 0 && <span className="ml-1 text-green font-semibold">· {discoverCount} AI-discovered</span>}
            {suggestedLinks.length > 0 && <span className="ml-1 text-violet font-semibold">· {visibleSuggestedLinks.length} suggested link{visibleSuggestedLinks.length !== 1 ? "s" : ""}</span>}
            {networkRiskScore != null && (
              <span className={`ml-2 px-1.5 py-px rounded font-mono text-9 font-bold ${networkRiskCls}`}>
                Network Risk: {networkRiskScore}/100
              </span>
            )}
          </p>
        )}
      </div>

      {/* Canvas */}
      <div className="rounded-xl overflow-hidden border border-hair-2" style={{ background: "#0a0d0f" }}>
        <svg
          ref={svgRef}
          width="100%"
          height="540"
          style={{ cursor: isPanning.current ? "grabbing" : "grab", display: "block" }}
          onWheel={onWheel}
          onMouseDown={onSvgMouseDown}
          onMouseMove={onSvgMouseMove}
          onMouseUp={onSvgMouseUp}
          onMouseLeave={onSvgMouseUp}
        >
          <defs>
            <marker id="arr-dark" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#475569" />
            </marker>
            <marker id="arr-ai" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#34d399" />
            </marker>
            <marker id="arr-suggested" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#a78bfa" />
            </marker>
            <filter id="glow-green">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glow-pink">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Edges (confirmed + suggested overlay) */}
            {allEdges.map((e) => {
              const a = nodesById[e.from];
              const b = nodesById[e.to];
              if (!a || !b) return null;
              const isAi = !e.suggested && (b.kind === "ai_discovered");
              const isSuggested = e.suggested === true;
              const faded = selectedId && selectedId !== a.id && selectedId !== b.id;
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2 - 30;
              const edgeKey = isSuggested ? `suggested-${e.suggestedId ?? `${e.from}-${e.to}`}` : `${e.from}-${e.to}`;
              return (
                <g key={edgeKey} style={{ opacity: faded ? 0.1 : 1, transition: "opacity 0.15s" }}>
                  <path d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                    fill="none"
                    stroke={isSuggested ? "#a78bfa" : isAi ? "#34d399" : "#334155"}
                    strokeWidth={isSuggested ? 1.5 : isAi ? 1.5 : 1}
                    strokeDasharray={isSuggested ? "8 4" : isAi ? "5 3" : ""}
                    markerEnd={isSuggested ? "url(#arr-suggested)" : isAi ? "url(#arr-ai)" : "url(#arr-dark)"}
                    style={{ opacity: isSuggested ? 0.65 : isAi ? 0.7 : 0.6 }}
                  />
                  {e.label && (
                    <text x={mx} y={my - 4} textAnchor="middle" style={{ fontSize: 9, fill: isSuggested ? "#a78bfa" : isAi ? "#34d399" : "#475569", fontFamily: "monospace" }}>
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map((n) => {
              const cfg = KIND_CFG[n.kind];
              const isSelected = selectedId === n.id;
              const faded = selectedId && !isSelected;
              const isSubject = n.kind === "subject";
              const isAi = n.kind === "ai_discovered";
              const w = isSubject ? NODE_W + 20 : NODE_W;
              const h = isSubject ? NODE_H + 6 : NODE_H;
              return (
                <g key={n.id}
                  data-node="1"
                  style={{ cursor: "grab", opacity: faded ? 0.2 : 1, transition: "opacity 0.15s", filter: isSubject ? "url(#glow-pink)" : isAi ? "url(#glow-green)" : "none" }}
                  onMouseDown={(e) => onNodeMouseDown(e, n.id)}
                  onClick={() => setSelectedId(selectedId === n.id ? null : n.id)}
                >
                  {/* Outer glow ring on selected */}
                  {isSelected && <rect x={n.x - w / 2 - 4} y={n.y - h / 2 - 4} width={w + 8} height={h + 8} rx={10} fill="none" stroke={cfg.stroke} strokeWidth={1.5} style={{ opacity: 0.4 }} />}
                  {/* Node body */}
                  <rect
                    x={n.x - w / 2} y={n.y - h / 2} width={w} height={h} rx={7}
                    fill={cfg.fill}
                    stroke={cfg.stroke}
                    strokeWidth={isSelected ? 2.5 : isSubject ? 2 : 1.5}
                    strokeDasharray={cfg.dash}
                  />
                  {/* Confidence bar for AI nodes */}
                  {isAi && n.confidence != null && (
                    <rect x={n.x - w / 2 + 4} y={n.y + h / 2 - 5} width={Math.round((w - 8) * n.confidence / 100)} height={3} rx={1.5} fill={cfg.stroke} style={{ opacity: 0.6 }} />
                  )}
                  {/* Icon */}
                  <text x={n.x - w / 2 + 12} y={n.y + 5} style={{ fontSize: isSubject ? 15 : 13, fill: cfg.badge, fontFamily: "monospace" }}>{cfg.icon}</text>
                  {/* Label */}
                  <text x={n.x - w / 2 + 28} y={n.y + 5} style={{ fontSize: isSubject ? 12 : 10.5, fill: cfg.text, fontWeight: isSubject ? 700 : 600, fontFamily: "system-ui, sans-serif" }}>
                    {n.label.length > (isSubject ? 22 : 18) ? n.label.slice(0, isSubject ? 20 : 16) + "…" : n.label}
                  </text>
                  {/* AI confidence chip */}
                  {isAi && n.confidence != null && (
                    <text x={n.x + w / 2 - 6} y={n.y - h / 2 + 11} textAnchor="end" style={{ fontSize: 8, fill: cfg.stroke, fontFamily: "monospace" }}>{n.confidence}%</text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Canvas footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t text-10 font-mono" style={{ borderColor: "#1e293b", background: "#080b0d" }}>
          {/* Legend */}
          <div className="flex items-center gap-3 flex-wrap">
            {(Object.entries(KIND_CFG) as [NodeKind, typeof KIND_CFG[NodeKind]][]).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1" style={{ color: "#64748b" }}>
                <span style={{ color: v.stroke, fontSize: 11 }}>{v.icon}</span>
                <span className="capitalize" style={{ color: "#94a3b8" }}>{k.replace("_", " ")}</span>
              </span>
            ))}
            {/* Suggested link legend entry */}
            {suggestedLinks.length > 0 && (
              <span className="flex items-center gap-1" style={{ color: "#64748b" }}>
                <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="8 4" /></svg>
                <span style={{ color: "#a78bfa" }}>AI suggested link</span>
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3" style={{ color: "#475569" }}>
            <span>scroll to zoom · drag to pan · drag nodes</span>
            <span style={{ color: "#94a3b8" }}>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={{ color: "#60a5fa" }} className="hover:opacity-70">Reset view</button>
          </div>
        </div>
      </div>

      {/* Selected node detail */}
      {selectedNode && (
        <div className="mt-3 bg-bg-panel border border-hair-2 rounded-xl p-4 flex items-start gap-4">
          <span style={{ color: KIND_CFG[selectedNode.kind].stroke, fontSize: 22 }}>{KIND_CFG[selectedNode.kind].icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-13 font-semibold text-ink-0">{selectedNode.label}</span>
              <span className="font-mono text-9 px-1.5 py-px rounded uppercase" style={{ background: KIND_CFG[selectedNode.kind].fill, color: KIND_CFG[selectedNode.kind].stroke, border: `1px solid ${KIND_CFG[selectedNode.kind].stroke}40` }}>{selectedNode.kind.replace("_", " ")}</span>
              {selectedNode.confidence != null && <span className="font-mono text-9 px-1.5 py-px rounded bg-green-dim text-green">{selectedNode.confidence}% confidence</span>}
            </div>
            {selectedNode.relationship && <div className="text-11 text-ink-2 mb-0.5"><strong className="text-ink-3">Relationship:</strong> {selectedNode.relationship}</div>}
            {selectedNode.reasoning && <div className="text-11 text-ink-2 italic">{selectedNode.reasoning}</div>}
            <div className="text-10 font-mono text-ink-4 mt-1">
              {allEdges.filter((e) => e.from === selectedNode.id || e.to === selectedNode.id).length} connection{allEdges.filter((e) => e.from === selectedNode.id || e.to === selectedNode.id).length !== 1 ? "s" : ""}
            </div>
          </div>
          <button type="button" onClick={() => setSelectedId(null)} className="text-ink-3 hover:text-ink-1 text-14">×</button>
        </div>
      )}

      {/* AI Discover Links suggestion panel */}
      {(discoveringLinks || suggestedLinks.length > 0) && (
        <div className="mt-3 bg-bg-panel border border-violet/30 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-violet/20" style={{ background: "rgba(139,92,246,0.06)" }}>
            <div className="flex items-center gap-2">
              <span className="text-11 font-semibold uppercase tracking-wide-3 text-violet">AI Link Discovery</span>
              {networkRiskScore != null && (
                <span className={`font-mono text-9 px-2 py-px rounded font-bold ${networkRiskCls}`}>
                  Network Risk: {networkRiskScore}/100
                </span>
              )}
              {confirmedFromSuggested.length > 0 && (
                <span className="font-mono text-9 px-1.5 py-px rounded bg-green-dim text-green">{confirmedFromSuggested.length} confirmed</span>
              )}
            </div>
            {discoveringLinks && <span className="font-mono text-10 text-ink-3 animate-pulse">Analyzing network…</span>}
          </div>

          {discoverLinksSummary && (
            <div className="px-4 py-2.5 border-b border-hair-2">
              <p className="text-11 text-ink-2 leading-relaxed">{discoverLinksSummary}</p>
            </div>
          )}

          {visibleSuggestedLinks.length > 0 && (
            <div className="divide-y divide-hair-1">
              {visibleSuggestedLinks.map((sl) => {
                const fromNode = nodesById[sl.fromId];
                const toNode = nodesById[sl.toId];
                const confidenceCls = sl.confidence >= 80 ? "text-red" : sl.confidence >= 60 ? "text-amber" : "text-green";
                return (
                  <div key={`${sl.fromId}|${sl.toId}`} className="px-4 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-10 font-semibold text-ink-0">{fromNode?.label ?? sl.fromId}</span>
                        <span className="text-ink-4 text-10">→</span>
                        <span className="font-mono text-10 font-semibold text-ink-0">{toNode?.label ?? sl.toId}</span>
                        <span className="font-mono text-9 px-1.5 py-px rounded bg-violet/10 text-violet border border-violet/20">{sl.linkType.replace(/_/g, " ")}</span>
                        <span className={`font-mono text-9 font-bold ${confidenceCls}`}>{sl.confidence}% confidence</span>
                      </div>
                      <p className="text-11 text-ink-2 leading-relaxed mb-0.5">{sl.reasoning}</p>
                      <p className="text-10 font-mono text-ink-4">{sl.fatfRef}</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0 mt-0.5">
                      <button type="button" onClick={() => addSuggestedLink(sl)}
                        className="font-mono text-9 px-2 py-1 rounded bg-green/10 text-green border border-green/30 hover:bg-green/20 transition-colors whitespace-nowrap">
                        Add Link
                      </button>
                      <button type="button" onClick={() => dismissSuggestedLink(sl)}
                        className="font-mono text-9 px-2 py-1 rounded bg-bg-1 text-ink-3 border border-hair-2 hover:border-hair-3 hover:text-ink-1 transition-colors">
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!discoveringLinks && suggestedLinks.length > 0 && visibleSuggestedLinks.length === 0 && (
            <div className="px-4 py-3 text-11 text-ink-3 font-mono">All suggestions have been actioned.</div>
          )}
        </div>
      )}

      {/* Brain Analysis panel */}
      {committed && (
        <div className="bg-bg-panel border border-hair-2 rounded-xl p-4 mt-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-11 font-semibold uppercase tracking-wide-3 text-ink-2">Brain Analysis</div>
            <button type="button" onClick={() => void analyzeSubject()} disabled={brainLoading}
              className="font-mono text-10.5 uppercase tracking-wide-3 font-medium px-4 py-1.5 rounded bg-brand text-white hover:opacity-90 disabled:opacity-50">
              {brainLoading ? "Analyzing…" : "Generate Analysis"}
            </button>
          </div>
          {brainLoading && <p className="font-mono text-11 text-ink-3 animate-pulse">Analyzing <span className="text-ink-1 font-semibold">{committed}</span>…</p>}
          {brainAnalysis && !brainLoading && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-10 font-mono text-ink-3 uppercase tracking-wide-3">Risk:</span>
                <span className={`font-mono text-10 px-2 py-px rounded uppercase font-bold ${riskCls[brainAnalysis.riskLevel]}`}>{brainAnalysis.riskLevel}</span>
              </div>
              {brainAnalysis.typologies.length > 0 && (
                <div>
                  <div className="text-10 font-mono text-ink-3 uppercase tracking-wide-3 mb-1">Typologies</div>
                  <div className="flex flex-wrap gap-1.5">
                    {brainAnalysis.typologies.map((t) => <span key={t} className="font-mono text-10 px-1.5 py-px rounded bg-red-dim text-red border border-red/20">{t}</span>)}
                  </div>
                </div>
              )}
              <p className="text-12 text-ink-1 leading-relaxed">{brainAnalysis.narrative}</p>
              <div className="grid grid-cols-2 gap-3">
                {brainAnalysis.keyRelationships.length > 0 && (
                  <div>
                    <div className="text-10 font-mono text-ink-3 uppercase tracking-wide-3 mb-1">Key Relationships</div>
                    <ul className="text-11 text-ink-2 space-y-0.5 list-disc list-inside">
                      {brainAnalysis.keyRelationships.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                )}
                {brainAnalysis.nextSteps.length > 0 && (
                  <div>
                    <div className="text-10 font-mono text-ink-3 uppercase tracking-wide-3 mb-1">Next Steps</div>
                    <ol className="text-11 text-ink-2 space-y-0.5 list-decimal list-inside">
                      {brainAnalysis.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evidence Pack Modal / Panel */}
      {showEvidencePack && evidencePack && (
        <div className="mt-3 bg-bg-panel border border-amber/30 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber/20" style={{ background: "rgba(245,158,11,0.06)" }}>
            <div className="flex items-center gap-3">
              <span className="text-13">📦</span>
              <div>
                <div className="text-11 font-semibold uppercase tracking-wide-3 text-amber">Evidence Pack</div>
                <div className="text-10 font-mono text-ink-3">Generated {new Date(evidencePack.generatedAt).toLocaleString()}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => window.print()}
                className="font-mono text-10.5 font-medium px-3 py-1.5 rounded border border-amber/40 text-amber hover:bg-amber/10 transition-colors whitespace-nowrap">
                ↓ Print / Export PDF
              </button>
              <button type="button" onClick={() => setShowEvidencePack(false)}
                className="text-ink-3 hover:text-ink-1 text-14 ml-1">×</button>
            </div>
          </div>

          {/* Sections */}
          <div className="divide-y divide-hair-1">
            {/* Case Overview */}
            <div>
              <button type="button" onClick={() => toggleSection("caseOverview")}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-1 transition-colors">
                <span className="text-11 font-semibold text-ink-1">Case Overview</span>
                <span className="text-ink-4 text-12">{expandedSections.has("caseOverview") ? "▲" : "▼"}</span>
              </button>
              {expandedSections.has("caseOverview") && (
                <div className="px-4 pb-4">
                  <p className="text-12 text-ink-1 leading-relaxed whitespace-pre-line">{evidencePack.caseOverview}</p>
                </div>
              )}
            </div>

            {/* Entity Profiles */}
            <div>
              <button type="button" onClick={() => toggleSection("entityProfiles")}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-1 transition-colors">
                <span className="text-11 font-semibold text-ink-1">Entity Profiles</span>
                <span className="text-ink-4 text-12">{expandedSections.has("entityProfiles") ? "▲" : "▼"}</span>
              </button>
              {expandedSections.has("entityProfiles") && (
                <div className="px-4 pb-4 space-y-3">
                  {Object.entries(evidencePack.entityProfiles).map(([name, profile]) => (
                    <div key={name} className="rounded-lg border border-hair-2 p-3">
                      <div className="text-11 font-semibold text-ink-0 mb-1">{name}</div>
                      <p className="text-11 text-ink-2 leading-relaxed">{profile}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Network Analysis */}
            <div>
              <button type="button" onClick={() => toggleSection("networkNarrative")}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-1 transition-colors">
                <span className="text-11 font-semibold text-ink-1">Network Analysis</span>
                <span className="text-ink-4 text-12">{expandedSections.has("networkNarrative") ? "▲" : "▼"}</span>
              </button>
              {expandedSections.has("networkNarrative") && (
                <div className="px-4 pb-4">
                  <p className="text-12 text-ink-1 leading-relaxed">{evidencePack.networkNarrative}</p>
                </div>
              )}
            </div>

            {/* Evidence Points */}
            <div>
              <button type="button" onClick={() => toggleSection("evidencePoints")}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-1 transition-colors">
                <span className="text-11 font-semibold text-ink-1">Evidence Points</span>
                <span className="text-ink-4 text-12">{expandedSections.has("evidencePoints") ? "▲" : "▼"}</span>
              </button>
              {expandedSections.has("evidencePoints") && (
                <div className="px-4 pb-4">
                  <ol className="space-y-2">
                    {evidencePack.evidencePoints.map((pt, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="font-mono text-10 font-bold text-amber shrink-0 mt-0.5">{i + 1}.</span>
                        <span className="text-12 text-ink-1 leading-relaxed">{pt}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            {/* Next Steps */}
            <div>
              <button type="button" onClick={() => toggleSection("nextSteps")}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-1 transition-colors">
                <span className="text-11 font-semibold text-ink-1">Next Steps</span>
                <span className="text-ink-4 text-12">{expandedSections.has("nextSteps") ? "▲" : "▼"}</span>
              </button>
              {expandedSections.has("nextSteps") && (
                <div className="px-4 pb-4">
                  <ol className="space-y-2">
                    {evidencePack.nextSteps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="font-mono text-10 font-bold text-blue shrink-0 mt-0.5">{i + 1}.</span>
                        <span className="text-12 text-ink-1 leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            {/* Regulatory Basis */}
            <div>
              <button type="button" onClick={() => toggleSection("regulatoryBasis")}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-1 transition-colors">
                <span className="text-11 font-semibold text-ink-1">Regulatory Basis</span>
                <span className="text-ink-4 text-12">{expandedSections.has("regulatoryBasis") ? "▲" : "▼"}</span>
              </button>
              {expandedSections.has("regulatoryBasis") && (
                <div className="px-4 pb-4">
                  <p className="text-12 text-ink-1 leading-relaxed">{evidencePack.regulatoryBasis}</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-hair-2 flex items-center justify-between" style={{ background: "#080b0d" }}>
            <span className="font-mono text-10 text-ink-4">Court-ready evidence pack · Hawkeye Sterling AML Platform</span>
            <button type="button" onClick={() => window.print()}
              className="font-mono text-10 font-medium px-3 py-1.5 rounded border border-amber/40 text-amber hover:bg-amber/10 transition-colors">
              ↓ Print / Export PDF
            </button>
          </div>
        </div>
      )}
    </ModuleLayout>
  );
}
