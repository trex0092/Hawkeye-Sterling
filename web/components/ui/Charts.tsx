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

// Minimal, dependency-free horizontal bar chart.
// Rendered as HTML/flex so text sizes are independent of container width
// and stay consistent with the rest of the editorial light theme.
export function BarChart({ data, height, compact }: Props) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => b.value - a.value),
    [data],
  );

  const max = sorted.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  const rowHeight = compact ? 22 : 28;
  const barHeight = rowHeight - 10;

  return (
    <div
      className="w-full"
      role="img"
      aria-label="Catalogue size chart"
      style={height ? { minHeight: height } : undefined}
    >
      {sorted.map((d) => {
        const pct = (d.value / max) * 100;
        const tone = d.tone ?? "brand";
        return (
          <div
            key={d.label}
            className="flex items-center gap-3"
            style={{ height: rowHeight }}
          >
            <div className="w-[160px] shrink-0 text-right font-mono text-11 text-ink-1 truncate">
              {d.label}
            </div>
            <div
              className="flex-1 rounded-sm bg-bg-2 relative"
              style={{ height: barHeight }}
            >
              <div
                className={`absolute inset-y-0 left-0 rounded-sm ${TONE_CLASS[tone]}`}
                style={{
                  width: `${Math.max(0.5, pct)}%`,
                  background: TONE_HEX[tone],
                }}
              />
            </div>
            <div className="w-[56px] shrink-0 text-right font-mono text-11 font-semibold text-ink-0">
              {d.value.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
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
