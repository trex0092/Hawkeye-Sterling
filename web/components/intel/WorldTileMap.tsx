"use client";

// Tile-grid cartogram of the world. Each country is a single square arranged
// on a geographic-ish grid (column = longitude bucket, row = latitude bucket).
// Trade-offs vs a true geographic SVG:
//   • Far smaller payload (~3 KB) than the 250-country path data a real
//     choropleth requires.
//   • Reads at-a-glance because every country has the same area; no risk of
//     the eye being drawn to Russia or Canada by virtue of size alone.
//   • Resolution-independent — scales cleanly on any breakpoint.
//
// Country tile placement reflects the WSJ / FT cartogram convention; the
// most-screening-relevant ~80 jurisdictions are represented. Tiles for
// countries without exposure are still drawn (in muted grey) so the map
// never looks empty after a quiet day.

import { useMemo } from "react";
import type { BaselTier, JurisdictionRisk, FATFStatus } from "@/lib/data/jurisdictions";

interface Tile {
  iso2: string;
  /** column (0 = far west) */
  col: number;
  /** row (0 = far north) */
  row: number;
}

// Hand-tuned world tile-grid (rows top-to-bottom = N→S, cols left-to-right = W→E).
// Coverage: 80 jurisdictions including all FATF black/grey + EU AMLD high-risk
// + major economies + UAE neighbourhood.
const TILES: ReadonlyArray<Tile> = [
  // Row 0 — Arctic / Northern Europe / Northern Asia
  { iso2: "IS", col: 6, row: 0 },
  { iso2: "NO", col: 9, row: 0 },
  { iso2: "SE", col: 10, row: 0 },
  { iso2: "FI", col: 11, row: 0 },
  { iso2: "RU", col: 13, row: 0 },

  // Row 1 — Canada / N Europe / N Asia
  { iso2: "CA", col: 3, row: 1 },
  { iso2: "GB", col: 8, row: 1 },
  { iso2: "DK", col: 9, row: 1 },
  { iso2: "EE", col: 11, row: 1 },
  { iso2: "LV", col: 11, row: 2 },
  { iso2: "LT", col: 11, row: 3 },

  // Row 2 — USA top / Europe / C Asia
  { iso2: "US", col: 3, row: 3 },
  { iso2: "IE", col: 7, row: 2 },
  { iso2: "NL", col: 9, row: 2 },
  { iso2: "DE", col: 9, row: 3 },
  { iso2: "PL", col: 10, row: 3 },
  { iso2: "BY", col: 11, row: 3 },
  { iso2: "UA", col: 12, row: 3 },
  { iso2: "KZ", col: 13, row: 3 },
  { iso2: "MN", col: 15, row: 2 },
  { iso2: "JP", col: 17, row: 3 },
  { iso2: "KR", col: 16, row: 3 },
  { iso2: "KP", col: 16, row: 2 },

  // Row 3 / 4 — central swathe
  { iso2: "BE", col: 8, row: 3 },
  { iso2: "FR", col: 8, row: 4 },
  { iso2: "CH", col: 9, row: 4 },
  { iso2: "AT", col: 10, row: 4 },
  { iso2: "CZ", col: 10, row: 4 },
  { iso2: "SK", col: 11, row: 4 },
  { iso2: "HU", col: 11, row: 5 },
  { iso2: "RO", col: 12, row: 4 },
  { iso2: "BG", col: 12, row: 5 },
  { iso2: "GR", col: 11, row: 6 },
  { iso2: "HR", col: 10, row: 5 },
  { iso2: "RS", col: 11, row: 5 },
  { iso2: "AL", col: 10, row: 6 },
  { iso2: "MC", col: 9, row: 5 },
  { iso2: "IT", col: 9, row: 5 },
  { iso2: "ES", col: 7, row: 5 },
  { iso2: "PT", col: 6, row: 5 },

  // Row 4-5 — North Africa / Middle East
  { iso2: "MA", col: 6, row: 6 },
  { iso2: "DZ", col: 7, row: 6 },
  { iso2: "TN", col: 8, row: 6 },
  { iso2: "LY", col: 9, row: 6 },
  { iso2: "EG", col: 11, row: 7 },
  { iso2: "TR", col: 12, row: 6 },
  { iso2: "SY", col: 13, row: 6 },
  { iso2: "LB", col: 12, row: 7 },
  { iso2: "JO", col: 13, row: 7 },
  { iso2: "IL", col: 12, row: 7 },
  { iso2: "IQ", col: 13, row: 7 },
  { iso2: "IR", col: 14, row: 7 },
  { iso2: "AF", col: 15, row: 7 },
  { iso2: "PK", col: 15, row: 8 },
  { iso2: "IN", col: 16, row: 8 },
  { iso2: "CN", col: 17, row: 7 },
  { iso2: "SA", col: 13, row: 8 },
  { iso2: "AE", col: 14, row: 8 },
  { iso2: "OM", col: 15, row: 9 },
  { iso2: "YE", col: 13, row: 9 },
  { iso2: "QA", col: 14, row: 9 },
  { iso2: "KW", col: 14, row: 7 },
  { iso2: "BH", col: 15, row: 7 },

  // Row 6-8 — Sub-Saharan Africa
  { iso2: "SN", col: 5, row: 8 },
  { iso2: "ML", col: 7, row: 7 },
  { iso2: "BF", col: 8, row: 7 },
  { iso2: "NE", col: 9, row: 7 },
  { iso2: "TD", col: 10, row: 7 },
  { iso2: "SD", col: 11, row: 8 },
  { iso2: "ER", col: 12, row: 8 },
  { iso2: "ET", col: 12, row: 9 },
  { iso2: "SS", col: 11, row: 9 },
  { iso2: "NG", col: 8, row: 8 },
  { iso2: "CI", col: 7, row: 8 },
  { iso2: "CM", col: 9, row: 8 },
  { iso2: "CD", col: 10, row: 9 },
  { iso2: "AO", col: 9, row: 10 },
  { iso2: "KE", col: 12, row: 10 },
  { iso2: "TZ", col: 11, row: 10 },
  { iso2: "MZ", col: 11, row: 11 },
  { iso2: "ZA", col: 10, row: 12 },
  { iso2: "NA", col: 9, row: 11 },
  { iso2: "ZW", col: 10, row: 11 },

  // Row 7-9 — South / South-East Asia / Oceania
  { iso2: "BD", col: 17, row: 8 },
  { iso2: "MM", col: 17, row: 9 },
  { iso2: "TH", col: 17, row: 10 },
  { iso2: "VN", col: 18, row: 10 },
  { iso2: "PH", col: 19, row: 9 },
  { iso2: "MY", col: 18, row: 11 },
  { iso2: "SG", col: 18, row: 12 },
  { iso2: "ID", col: 18, row: 13 },
  { iso2: "AU", col: 19, row: 13 },
  { iso2: "NZ", col: 20, row: 14 },
  { iso2: "HK", col: 18, row: 9 },
  { iso2: "TW", col: 19, row: 8 },

  // Latin America
  { iso2: "MX", col: 2, row: 5 },
  { iso2: "CU", col: 4, row: 6 },
  { iso2: "HT", col: 4, row: 7 },
  { iso2: "DO", col: 5, row: 7 },
  { iso2: "PA", col: 3, row: 7 },
  { iso2: "VE", col: 4, row: 8 },
  { iso2: "CO", col: 3, row: 8 },
  { iso2: "EC", col: 3, row: 9 },
  { iso2: "PE", col: 3, row: 10 },
  { iso2: "BR", col: 5, row: 10 },
  { iso2: "AR", col: 4, row: 12 },
  { iso2: "CL", col: 3, row: 12 },
  { iso2: "UY", col: 5, row: 12 },
];

const TIER_FILL: Record<BaselTier, string> = {
  very_high: "#ef4444",
  high:      "#f97316",
  medium:    "#facc15",
  low:       "#34d399",
  very_low:  "#86efac",
};

const FATF_STROKE: Record<FATFStatus, string> = {
  call_for_action: "#7f1d1d",
  increased_monitoring: "#9a3412",
  not_listed: "transparent",
};

interface Props {
  exposure: Record<string, number>;
  risk: readonly JurisdictionRisk[];
}

export function WorldTileMap({ exposure, risk }: Props) {
  const byIso = useMemo(() => {
    const m = new Map<string, JurisdictionRisk>();
    for (const r of risk) m.set(r.iso2, r);
    return m;
  }, [risk]);

  const max = useMemo(
    () => Math.max(1, ...Object.values(exposure)),
    [exposure],
  );

  // Tile geometry — keep modest so the SVG fits without scrolling.
  const cell = 26;
  const gap = 3;
  const cols = TILES.reduce((m, t) => Math.max(m, t.col), 0) + 1;
  const rows = TILES.reduce((m, t) => Math.max(m, t.row), 0) + 1;
  const w = cols * (cell + gap);
  const h = rows * (cell + gap);

  return (
    <svg
      role="img"
      aria-label="World choropleth — country exposure tile grid"
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-auto"
    >
      <title>Country exposure tile grid (cartogram)</title>
      {TILES.map((t) => {
        const r = byIso.get(t.iso2);
        const count = exposure[t.iso2] ?? 0;
        const intensity = count > 0 ? 0.35 + 0.65 * (count / max) : 0.10;
        const tier: BaselTier = r?.baselTier ?? "very_low";
        const fill = TIER_FILL[tier];
        const stroke = r?.fatf ? FATF_STROKE[r.fatf] : "transparent";
        const x = t.col * (cell + gap);
        const y = t.row * (cell + gap);
        return (
          <g key={t.iso2}>
            <rect
              x={x}
              y={y}
              width={cell}
              height={cell}
              rx={3}
              fill={fill}
              fillOpacity={intensity}
              stroke={stroke}
              strokeWidth={stroke === "transparent" ? 0 : 1.5}
            >
              <title>
                {`${t.iso2} ${r?.name ?? t.iso2} · tier=${tier}` +
                  (count > 0 ? ` · exposure=${count}` : " · no exposure") +
                  (r?.fatf && r.fatf !== "not_listed"
                    ? ` · FATF ${r.fatf.replace("_", "-")}`
                    : "") +
                  (r?.eu === "high_risk_third_country" ? " · EU high-risk" : "")}
              </title>
            </rect>
            <text
              x={x + cell / 2}
              y={y + cell / 2 + 3}
              textAnchor="middle"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fontSize={8}
              fontWeight={600}
              fill="#0f172a"
              opacity={0.85}
              pointerEvents="none"
            >
              {t.iso2}
            </text>
            {count > 0 && (
              <text
                x={x + cell - 2}
                y={y + 8}
                textAnchor="end"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontSize={7}
                fontWeight={700}
                fill="#0f172a"
                pointerEvents="none"
              >
                {count}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
