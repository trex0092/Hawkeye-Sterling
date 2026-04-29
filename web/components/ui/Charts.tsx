"use client";

import { useEffect, useMemo, useState } from "react";

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

// Animated horizontal bar chart.
export function BarChart({ data, height, compact }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
      {sorted.map((d, i) => {
        const pct = (d.value / max) * 100;
        const tone = d.tone ?? "brand";
        return (
          <div
            key={d.label}
            className="flex items-center gap-3 group"
            style={{ height: rowHeight }}
          >
            <div className="w-[160px] shrink-0 text-right font-mono text-11 text-ink-1 truncate group-hover:text-ink-0 transition-colors">
              {d.label}
            </div>
            <div
              className="flex-1 rounded-sm bg-bg-2 relative overflow-hidden"
              style={{ height: barHeight }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{
                  width: visible ? `${Math.max(0.5, pct)}%` : "0%",
                  background: TONE_HEX[tone],
                  transition: `width ${0.35 + i * 0.025}s cubic-bezier(0.4, 0, 0.2, 1)`,
                }}
              />
            </div>
            <div
              className="w-[56px] shrink-0 text-right font-mono text-11 font-semibold text-ink-0 transition-opacity"
              style={{
                opacity: visible ? 1 : 0,
                transition: `opacity ${0.3 + i * 0.02}s ease`,
              }}
            >
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

// Animated SVG donut — segments draw in sequence on mount.
export function Donut({
  segments,
  size = 220,
  stroke = 28,
  centerValue,
  centerLabel,
}: DonutProps) {
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
        {/* Track ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-2)"
          strokeWidth={stroke}
        />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * circumference;
          const gap = circumference - dash;
          const isHovered = hovered === s.label;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={TONE_HEX[s.tone ?? "brand"]}
              strokeWidth={isHovered ? stroke + 6 : stroke}
              strokeDasharray={visible ? `${dash} ${gap}` : `0 ${circumference}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{
                transition: `stroke-dasharray ${0.45 + i * 0.08}s cubic-bezier(0.4,0,0.2,1), stroke-width 0.2s ease`,
                cursor: "pointer",
              }}
              onMouseEnter={() => setHovered(s.label)}
              onMouseLeave={() => setHovered(null)}
            >
              <title>{`${s.label} — ${s.value}`}</title>
            </circle>
          );
          offset += dash;
          return el;
        })}

        {/* Center text */}
        {hovered ? (
          <>
            <text x={size / 2} y={size / 2 - 2} textAnchor="middle"
              fontFamily="var(--font-display)" fontSize={size / 8} fill="var(--ink-0)">
              {segments.find((s) => s.label === hovered)?.value}
            </text>
            <text x={size / 2} y={size / 2 + 14} textAnchor="middle"
              fontFamily="var(--font-mono)" fontSize={9} letterSpacing="1" fill="var(--ink-2)">
              {hovered.toUpperCase().slice(0, 10)}
            </text>
          </>
        ) : (
          <>
            {centerValue !== undefined && (
              <text x={size / 2} y={size / 2 - (centerLabel ? 2 : 6)}
                textAnchor="middle" fontFamily="var(--font-display)"
                fontSize={size / 6} fill="var(--ink-0)"
                style={{ transition: "opacity 0.3s" }}>
                {centerValue}
              </text>
            )}
            {centerLabel && (
              <text x={size / 2} y={size / 2 + 20} textAnchor="middle"
                fontFamily="var(--font-mono)" fontSize={10}
                letterSpacing="1.5" fill="var(--ink-2)">
                {centerLabel.toUpperCase()}
              </text>
            )}
          </>
        )}
      </svg>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 justify-center max-w-full">
        {segments.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-1.5 text-10 font-mono cursor-pointer transition-colors"
            style={{ color: hovered === s.label ? TONE_HEX[s.tone ?? "brand"] : "var(--ink-2)" }}
            onMouseEnter={() => setHovered(s.label)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="inline-block w-2 h-2 rounded-full"
              style={{ background: TONE_HEX[s.tone ?? "brand"] }} />
            {s.label}
            <span style={{ color: hovered === s.label ? TONE_HEX[s.tone ?? "brand"] : "var(--ink-0)" }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
