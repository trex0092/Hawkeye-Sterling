"use client";

import { useMemo } from "react";

export interface BarDatum {
  label: string;
  value: number;
  tone?: "brand" | "violet" | "amber" | "green" | "blue" | "red";
}

interface Props {
  data: BarDatum[];
  height?: number;
  compact?: boolean;
}

const TONE_CLASS: Record<NonNullable<BarDatum["tone"]>, string> = {
  brand: "fill-brand",
  violet: "fill-violet",
  amber: "fill-amber",
  green: "fill-green",
  blue: "fill-blue",
  red: "fill-red",
};

const TONE_HEX: Record<NonNullable<BarDatum["tone"]>, string> = {
  brand: "var(--brand)",
  violet: "var(--violet)",
  amber: "var(--amber)",
  green: "var(--green)",
  blue: "var(--blue)",
  red: "var(--red)",
};

// Minimal, dependency-free horizontal bar chart rendered as inline SVG.
// Uses CSS variables so it matches the editorial light theme.
export function BarChart({ data, height, compact }: Props) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => b.value - a.value),
    [data],
  );

  const max = sorted.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  const rowHeight = compact ? 22 : 28;
  const labelWidth = 180;
  const valueWidth = 56;
  const barGutter = 12;
  const innerWidth = 640;
  const barAreaWidth =
    innerWidth - labelWidth - valueWidth - barGutter * 2;
  const totalHeight = height ?? sorted.length * rowHeight + 12;

  return (
    <svg
      viewBox={`0 0 ${innerWidth} ${totalHeight}`}
      className="w-full h-auto"
      role="img"
      aria-label="Catalogue size chart"
    >
      {sorted.map((d, i) => {
        const y = i * rowHeight + 6;
        const barLen = (d.value / max) * barAreaWidth;
        const tone = d.tone ?? "brand";
        return (
          <g key={d.label}>
            <text
              x={labelWidth - 8}
              y={y + rowHeight / 2 + 4}
              textAnchor="end"
              fontFamily="var(--font-mono)"
              fontSize={11}
              fill="var(--ink-1)"
            >
              {d.label}
            </text>
            <rect
              x={labelWidth + barGutter}
              y={y + 4}
              width={barAreaWidth}
              height={rowHeight - 10}
              rx={3}
              fill="var(--bg-2)"
            />
            <rect
              x={labelWidth + barGutter}
              y={y + 4}
              width={Math.max(2, barLen)}
              height={rowHeight - 10}
              rx={3}
              fill={TONE_HEX[tone]}
              className={TONE_CLASS[tone]}
            />
            <text
              x={innerWidth - 4}
              y={y + rowHeight / 2 + 4}
              textAnchor="end"
              fontFamily="var(--font-mono)"
              fontSize={11}
              fontWeight={600}
              fill="var(--ink-0)"
            >
              {d.value.toLocaleString()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface DonutSegment {
  label: string;
  value: number;
  tone?: NonNullable<BarDatum["tone"]> | undefined;
}

interface DonutProps {
  segments: DonutSegment[];
  size?: number;
  stroke?: number;
  centerValue?: string;
  centerLabel?: string;
}

// Minimal SVG donut. Segments are drawn as stroked circle arcs.
export function Donut({
  segments,
  size = 220,
  stroke = 28,
  centerValue,
  centerLabel,
}: DonutProps) {
  const total = segments.reduce((t, s) => t + s.value, 0) || 1;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="inline-flex flex-col items-center">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="overflow-visible"
        role="img"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-2)"
          strokeWidth={stroke}
        />
        {segments.map((s) => {
          const frac = s.value / total;
          const dash = frac * circumference;
          const gap = circumference - dash;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={TONE_HEX[s.tone ?? "brand"]}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{`${s.label} — ${s.value}`}</title>
            </circle>
          );
          offset += dash;
          return el;
        })}
        {centerValue !== undefined && (
          <text
            x={size / 2}
            y={size / 2 - (centerLabel ? 2 : 6)}
            textAnchor="middle"
            fontFamily="var(--font-display)"
            fontSize={size / 6}
            fill="var(--ink-0)"
          >
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text
            x={size / 2}
            y={size / 2 + 20}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize={10}
            letterSpacing="1.5"
            fill="var(--ink-2)"
          >
            {centerLabel.toUpperCase()}
          </text>
        )}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 justify-center max-w-full">
        {segments.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-1.5 text-10 font-mono text-ink-2"
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: TONE_HEX[s.tone ?? "brand"] }}
            />
            {s.label}
            <span className="text-ink-0">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
