"use client";

import { useMemo } from "react";
import type { SuperBrainResult } from "@/lib/hooks/useSuperBrain";

// 6-axis risk radar — visualises the brain's verdict as a filled polygon
// on a hex backdrop. Every axis is bounded 0–100. Axes:
//   Sanctions, PEP, Adverse media, Jurisdiction, Typologies, Redlines
//
// Pure SVG, no deps. Size-agnostic — scales to fit its parent.

interface BrainRadarProps {
  result: SuperBrainResult;
  size?: number | undefined;
}

interface AxisValue {
  axis: string;
  value: number; // 0..100
  short: string;
}

function scoresFromResult(r: SuperBrainResult): AxisValue[] {
  const topSanction =
    r.screen.hits.length > 0
      ? Math.round(Math.max(...r.screen.hits.map((h) => h.score * 100)))
      : 0;
  const pep = r.pep ? Math.round(r.pep.salience * 100) : 0;
  const am = Math.min(100, (r.adverseMedia.length + r.adverseKeywordGroups.length) * 15);
  const jurisdiction = r.jurisdiction?.cahra
    ? 90
    : r.jurisdictionRich?.riskScore
      ? Math.round(r.jurisdictionRich.riskScore * 100)
      : r.jurisdiction?.regimes.length
        ? Math.min(70, r.jurisdiction.regimes.length * 10)
        : 10;
  const typology =
    r.typologies?.hits && r.typologies.hits.length > 0
      ? Math.min(100, Math.round((r.typologies.compositeScore ?? 0) * 100))
      : 0;
  const redlines = r.redlines.fired.length > 0 ? Math.min(100, r.redlines.fired.length * 25) : 0;
  return [
    { axis: "Sanctions", short: "SAN", value: topSanction },
    { axis: "PEP", short: "PEP", value: pep },
    { axis: "Adverse media", short: "AM", value: am },
    { axis: "Jurisdiction", short: "JUR", value: jurisdiction },
    { axis: "Typologies", short: "TYP", value: typology },
    { axis: "Redlines", short: "RED", value: redlines },
  ];
}

export function BrainRadar({ result, size = 220 }: BrainRadarProps) {
  const axes = useMemo(() => scoresFromResult(result), [result]);
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.42;
  const labelR = size * 0.49;

  const points = axes.map((a, i) => {
    const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    const r = (a.value / 100) * maxR;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      lx: cx + Math.cos(angle) * labelR,
      ly: cy + Math.sin(angle) * labelR,
      ...a,
      angle,
    };
  });
  const polygon = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  // Grid rings (20/40/60/80/100)
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0].map((f) => {
    const r = maxR * f;
    return axes
      .map((_, i) => {
        const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
        return `${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`;
      })
      .join(" ");
  });

  // Overall intensity informs polygon fill colour
  const avg = axes.reduce((a, b) => a + b.value, 0) / axes.length;
  const tone = avg >= 70 ? "#dc2626" : avg >= 40 ? "#f59e0b" : "#ec4899";
  const toneAlpha = avg >= 70 ? "rgba(220,38,38,0.22)" : avg >= 40 ? "rgba(245,158,11,0.20)" : "rgba(236,72,153,0.18)";

  return (
    <div className="bg-white border border-hair-2 rounded-lg p-3 mb-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-10.5 uppercase tracking-wide-4 font-semibold text-ink-2">
          Risk radar · 6-axis
        </span>
        <span className="font-mono text-11 text-ink-3">
          intensity {Math.round(avg)}%
        </span>
      </div>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto block"
      >
        {/* grid rings */}
        {rings.map((pts, i) => (
          <polygon
            key={i}
            points={pts}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={i === rings.length - 1 ? 1 : 0.5}
          />
        ))}
        {/* axis lines */}
        {axes.map((_, i) => {
          const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={cx + Math.cos(angle) * maxR}
              y2={cy + Math.sin(angle) * maxR}
              stroke="#e5e7eb"
              strokeWidth={0.5}
            />
          );
        })}
        {/* value polygon */}
        <polygon points={polygon} fill={toneAlpha} stroke={tone} strokeWidth={1.5} />
        {/* value dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={tone} />
        ))}
        {/* axis labels */}
        {points.map((p, i) => (
          <g key={`l${i}`}>
            <text
              x={p.lx}
              y={p.ly}
              textAnchor="middle"
              dominantBaseline="central"
              className="font-mono"
              style={{ fontSize: 9, fill: "#6b7280" }}
            >
              {p.short}
            </text>
          </g>
        ))}
      </svg>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 mt-2 text-10 font-mono">
        {axes.map((a) => (
          <div key={a.axis} className="flex justify-between">
            <span className="text-ink-2">{a.axis}</span>
            <span
              className={
                a.value >= 70 ? "text-red" : a.value >= 40 ? "text-amber" : "text-ink-0"
              }
            >
              {a.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
