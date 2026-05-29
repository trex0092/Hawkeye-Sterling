"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ModuleHero, ModuleLayout } from "@/components/layout/ModuleLayout";
import { ModuleFamilyBar } from "@/components/layout/ModuleFamilyBar";
import type { CountryRiskResult } from "@/app/api/country-risk/route";
import { apiErrorMessage } from "@/lib/client/error-utils";

// Country Risk Heat-Map — Module 35b
// SVG-based rectangular grid world map showing country risk levels.
// Regions: Europe, Middle East, Africa, Asia, Americas.

// ── Risk helpers ──────────────────────────────────────────────────────────────

function scoreToRisk(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 76) return "critical";
  if (score >= 51) return "high";
  if (score >= 26) return "medium";
  return "low";
}

const RISK_FILL: Record<string, string> = {
  low:      "#22c55e",
  medium:   "#f59e0b",
  high:     "#f97316",
  critical: "#ef4444",
  unknown:  "#374151",
};

const RISK_LABEL: Record<string, string> = {
  low:      "Low (0-25)",
  medium:   "Medium (26-50)",
  high:     "High (51-75)",
  critical: "Critical (76-100)",
};

const FATF_LABELS: Record<string, string> = {
  member:      "FATF Member",
  grey_list:   "FATF Grey List",
  greylist:    "FATF Grey List",
  black_list:  "FATF Black List",
  blacklist:   "FATF Black List",
  monitored:   "Monitored",
  compliant:   "Compliant",
  non_member:  "Non-Member",
};

const RISK_COLORS = {
  low:      "text-green bg-green-dim border-green/20",
  medium:   "text-amber bg-amber/10 border-amber/20",
  high:     "text-orange bg-orange/10 border-orange/20",
  critical: "text-red bg-red/10 border-red/20",
};

// ── Country grid layout ───────────────────────────────────────────────────────
// Each entry: [iso2, name, col, row, region]
// Grid is notional (not geo-projected) but grouped by continent block.

interface CountryCell {
  iso2: string;
  name: string;
  col: number;
  row: number;
  region: string;
}

const COUNTRIES: CountryCell[] = [
  // ── Europe ────────────────────────────────────────────────────────────────
  { iso2:"IS", name:"Iceland",        col:0,  row:0,  region:"Europe" },
  { iso2:"NO", name:"Norway",         col:1,  row:0,  region:"Europe" },
  { iso2:"SE", name:"Sweden",         col:2,  row:0,  region:"Europe" },
  { iso2:"FI", name:"Finland",        col:3,  row:0,  region:"Europe" },
  { iso2:"EE", name:"Estonia",        col:4,  row:0,  region:"Europe" },
  { iso2:"LV", name:"Latvia",         col:5,  row:0,  region:"Europe" },
  { iso2:"LT", name:"Lithuania",      col:6,  row:0,  region:"Europe" },
  { iso2:"IE", name:"Ireland",        col:0,  row:1,  region:"Europe" },
  { iso2:"GB", name:"United Kingdom", col:1,  row:1,  region:"Europe" },
  { iso2:"NL", name:"Netherlands",    col:2,  row:1,  region:"Europe" },
  { iso2:"DK", name:"Denmark",        col:3,  row:1,  region:"Europe" },
  { iso2:"PL", name:"Poland",         col:4,  row:1,  region:"Europe" },
  { iso2:"BY", name:"Belarus",        col:5,  row:1,  region:"Europe" },
  { iso2:"LU", name:"Luxembourg",     col:0,  row:2,  region:"Europe" },
  { iso2:"BE", name:"Belgium",        col:1,  row:2,  region:"Europe" },
  { iso2:"DE", name:"Germany",        col:2,  row:2,  region:"Europe" },
  { iso2:"CZ", name:"Czech Republic", col:3,  row:2,  region:"Europe" },
  { iso2:"SK", name:"Slovakia",       col:4,  row:2,  region:"Europe" },
  { iso2:"UA", name:"Ukraine",        col:5,  row:2,  region:"Europe" },
  { iso2:"FR", name:"France",         col:1,  row:3,  region:"Europe" },
  { iso2:"AT", name:"Austria",        col:2,  row:3,  region:"Europe" },
  { iso2:"HU", name:"Hungary",        col:3,  row:3,  region:"Europe" },
  { iso2:"RO", name:"Romania",        col:4,  row:3,  region:"Europe" },
  { iso2:"MD", name:"Moldova",        col:5,  row:3,  region:"Europe" },
  { iso2:"RU", name:"Russia",         col:6,  row:3,  region:"Europe" },
  { iso2:"PT", name:"Portugal",       col:0,  row:4,  region:"Europe" },
  { iso2:"ES", name:"Spain",          col:1,  row:4,  region:"Europe" },
  { iso2:"IT", name:"Italy",          col:2,  row:4,  region:"Europe" },
  { iso2:"SI", name:"Slovenia",       col:3,  row:4,  region:"Europe" },
  { iso2:"HR", name:"Croatia",        col:4,  row:4,  region:"Europe" },
  { iso2:"BA", name:"Bosnia",         col:5,  row:4,  region:"Europe" },
  { iso2:"RS", name:"Serbia",         col:6,  row:4,  region:"Europe" },
  { iso2:"GR", name:"Greece",         col:2,  row:5,  region:"Europe" },
  { iso2:"AL", name:"Albania",        col:3,  row:5,  region:"Europe" },
  { iso2:"MK", name:"N. Macedonia",   col:4,  row:5,  region:"Europe" },
  { iso2:"BG", name:"Bulgaria",       col:5,  row:5,  region:"Europe" },
  { iso2:"CY", name:"Cyprus",         col:6,  row:5,  region:"Europe" },
  { iso2:"MT", name:"Malta",          col:1,  row:5,  region:"Europe" },
  { iso2:"CH", name:"Switzerland",    col:0,  row:3,  region:"Europe" },

  // ── Middle East ───────────────────────────────────────────────────────────
  { iso2:"TR", name:"Turkey",         col:0,  row:0,  region:"Middle East" },
  { iso2:"GE", name:"Georgia",        col:1,  row:0,  region:"Middle East" },
  { iso2:"AM", name:"Armenia",        col:2,  row:0,  region:"Middle East" },
  { iso2:"AZ", name:"Azerbaijan",     col:3,  row:0,  region:"Middle East" },
  { iso2:"SY", name:"Syria",          col:0,  row:1,  region:"Middle East" },
  { iso2:"LB", name:"Lebanon",        col:1,  row:1,  region:"Middle East" },
  { iso2:"IL", name:"Israel",         col:2,  row:1,  region:"Middle East" },
  { iso2:"PS", name:"Palestine",      col:3,  row:1,  region:"Middle East" },
  { iso2:"JO", name:"Jordan",         col:0,  row:2,  region:"Middle East" },
  { iso2:"IQ", name:"Iraq",           col:1,  row:2,  region:"Middle East" },
  { iso2:"KW", name:"Kuwait",         col:2,  row:2,  region:"Middle East" },
  { iso2:"IR", name:"Iran",           col:3,  row:2,  region:"Middle East" },
  { iso2:"SA", name:"Saudi Arabia",   col:0,  row:3,  region:"Middle East" },
  { iso2:"BH", name:"Bahrain",        col:1,  row:3,  region:"Middle East" },
  { iso2:"QA", name:"Qatar",          col:2,  row:3,  region:"Middle East" },
  { iso2:"AE", name:"UAE",            col:3,  row:3,  region:"Middle East" },
  { iso2:"YE", name:"Yemen",          col:0,  row:4,  region:"Middle East" },
  { iso2:"OM", name:"Oman",           col:1,  row:4,  region:"Middle East" },
  { iso2:"AF", name:"Afghanistan",    col:2,  row:4,  region:"Middle East" },
  { iso2:"PK", name:"Pakistan",       col:3,  row:4,  region:"Middle East" },

  // ── Africa ────────────────────────────────────────────────────────────────
  { iso2:"MA", name:"Morocco",        col:0,  row:0,  region:"Africa" },
  { iso2:"DZ", name:"Algeria",        col:1,  row:0,  region:"Africa" },
  { iso2:"TN", name:"Tunisia",        col:2,  row:0,  region:"Africa" },
  { iso2:"LY", name:"Libya",          col:3,  row:0,  region:"Africa" },
  { iso2:"EG", name:"Egypt",          col:4,  row:0,  region:"Africa" },
  { iso2:"MR", name:"Mauritania",     col:0,  row:1,  region:"Africa" },
  { iso2:"ML", name:"Mali",           col:1,  row:1,  region:"Africa" },
  { iso2:"NE", name:"Niger",          col:2,  row:1,  region:"Africa" },
  { iso2:"TD", name:"Chad",           col:3,  row:1,  region:"Africa" },
  { iso2:"SD", name:"Sudan",          col:4,  row:1,  region:"Africa" },
  { iso2:"ER", name:"Eritrea",        col:5,  row:1,  region:"Africa" },
  { iso2:"SN", name:"Senegal",        col:0,  row:2,  region:"Africa" },
  { iso2:"GW", name:"Guinea-Bissau",  col:1,  row:2,  region:"Africa" },
  { iso2:"GN", name:"Guinea",         col:2,  row:2,  region:"Africa" },
  { iso2:"SL", name:"Sierra Leone",   col:3,  row:2,  region:"Africa" },
  { iso2:"LR", name:"Liberia",        col:4,  row:2,  region:"Africa" },
  { iso2:"ET", name:"Ethiopia",       col:5,  row:2,  region:"Africa" },
  { iso2:"GH", name:"Ghana",          col:0,  row:3,  region:"Africa" },
  { iso2:"TG", name:"Togo",           col:1,  row:3,  region:"Africa" },
  { iso2:"BJ", name:"Benin",          col:2,  row:3,  region:"Africa" },
  { iso2:"NG", name:"Nigeria",        col:3,  row:3,  region:"Africa" },
  { iso2:"CM", name:"Cameroon",       col:4,  row:3,  region:"Africa" },
  { iso2:"SO", name:"Somalia",        col:5,  row:3,  region:"Africa" },
  { iso2:"CI", name:"Ivory Coast",    col:0,  row:4,  region:"Africa" },
  { iso2:"BF", name:"Burkina Faso",   col:1,  row:4,  region:"Africa" },
  { iso2:"GA", name:"Gabon",          col:2,  row:4,  region:"Africa" },
  { iso2:"CD", name:"DR Congo",       col:3,  row:4,  region:"Africa" },
  { iso2:"UG", name:"Uganda",         col:4,  row:4,  region:"Africa" },
  { iso2:"KE", name:"Kenya",          col:5,  row:4,  region:"Africa" },
  { iso2:"ZA", name:"South Africa",   col:0,  row:5,  region:"Africa" },
  { iso2:"ZM", name:"Zambia",         col:1,  row:5,  region:"Africa" },
  { iso2:"ZW", name:"Zimbabwe",       col:2,  row:5,  region:"Africa" },
  { iso2:"TZ", name:"Tanzania",       col:3,  row:5,  region:"Africa" },
  { iso2:"MZ", name:"Mozambique",     col:4,  row:5,  region:"Africa" },
  { iso2:"MG", name:"Madagascar",     col:5,  row:5,  region:"Africa" },
  { iso2:"AO", name:"Angola",         col:1,  row:6,  region:"Africa" },
  { iso2:"BW", name:"Botswana",       col:2,  row:6,  region:"Africa" },
  { iso2:"NA", name:"Namibia",        col:0,  row:6,  region:"Africa" },

  // ── Asia ──────────────────────────────────────────────────────────────────
  { iso2:"KZ", name:"Kazakhstan",     col:0,  row:0,  region:"Asia" },
  { iso2:"TM", name:"Turkmenistan",   col:1,  row:0,  region:"Asia" },
  { iso2:"UZ", name:"Uzbekistan",     col:2,  row:0,  region:"Asia" },
  { iso2:"TJ", name:"Tajikistan",     col:3,  row:0,  region:"Asia" },
  { iso2:"KG", name:"Kyrgyzstan",     col:4,  row:0,  region:"Asia" },
  { iso2:"MN", name:"Mongolia",       col:5,  row:0,  region:"Asia" },
  { iso2:"CN", name:"China",          col:6,  row:0,  region:"Asia" },
  { iso2:"IN", name:"India",          col:0,  row:1,  region:"Asia" },
  { iso2:"NP", name:"Nepal",          col:1,  row:1,  region:"Asia" },
  { iso2:"BD", name:"Bangladesh",     col:2,  row:1,  region:"Asia" },
  { iso2:"MM", name:"Myanmar",        col:3,  row:1,  region:"Asia" },
  { iso2:"TH", name:"Thailand",       col:4,  row:1,  region:"Asia" },
  { iso2:"VN", name:"Vietnam",        col:5,  row:1,  region:"Asia" },
  { iso2:"KP", name:"North Korea",    col:6,  row:1,  region:"Asia" },
  { iso2:"LK", name:"Sri Lanka",      col:0,  row:2,  region:"Asia" },
  { iso2:"MV", name:"Maldives",       col:1,  row:2,  region:"Asia" },
  { iso2:"MY", name:"Malaysia",       col:2,  row:2,  region:"Asia" },
  { iso2:"SG", name:"Singapore",      col:3,  row:2,  region:"Asia" },
  { iso2:"ID", name:"Indonesia",      col:4,  row:2,  region:"Asia" },
  { iso2:"PH", name:"Philippines",    col:5,  row:2,  region:"Asia" },
  { iso2:"KR", name:"South Korea",    col:6,  row:2,  region:"Asia" },
  { iso2:"JP", name:"Japan",          col:0,  row:3,  region:"Asia" },
  { iso2:"TW", name:"Taiwan",         col:1,  row:3,  region:"Asia" },
  { iso2:"HK", name:"Hong Kong",      col:2,  row:3,  region:"Asia" },
  { iso2:"KH", name:"Cambodia",       col:3,  row:3,  region:"Asia" },
  { iso2:"LA", name:"Laos",           col:4,  row:3,  region:"Asia" },
  { iso2:"AU", name:"Australia",      col:5,  row:3,  region:"Asia" },
  { iso2:"NZ", name:"New Zealand",    col:6,  row:3,  region:"Asia" },

  // ── Americas ──────────────────────────────────────────────────────────────
  { iso2:"CA", name:"Canada",         col:0,  row:0,  region:"Americas" },
  { iso2:"US", name:"USA",            col:1,  row:0,  region:"Americas" },
  { iso2:"MX", name:"Mexico",         col:0,  row:1,  region:"Americas" },
  { iso2:"GT", name:"Guatemala",      col:1,  row:1,  region:"Americas" },
  { iso2:"BZ", name:"Belize",         col:2,  row:1,  region:"Americas" },
  { iso2:"HN", name:"Honduras",       col:3,  row:1,  region:"Americas" },
  { iso2:"SV", name:"El Salvador",    col:4,  row:1,  region:"Americas" },
  { iso2:"NI", name:"Nicaragua",      col:5,  row:1,  region:"Americas" },
  { iso2:"CU", name:"Cuba",           col:0,  row:2,  region:"Americas" },
  { iso2:"JM", name:"Jamaica",        col:1,  row:2,  region:"Americas" },
  { iso2:"HT", name:"Haiti",          col:2,  row:2,  region:"Americas" },
  { iso2:"DO", name:"Dominican Rep.", col:3,  row:2,  region:"Americas" },
  { iso2:"CR", name:"Costa Rica",     col:4,  row:2,  region:"Americas" },
  { iso2:"PA", name:"Panama",         col:5,  row:2,  region:"Americas" },
  { iso2:"CO", name:"Colombia",       col:0,  row:3,  region:"Americas" },
  { iso2:"VE", name:"Venezuela",      col:1,  row:3,  region:"Americas" },
  { iso2:"GY", name:"Guyana",         col:2,  row:3,  region:"Americas" },
  { iso2:"SR", name:"Suriname",       col:3,  row:3,  region:"Americas" },
  { iso2:"TT", name:"Trinidad",       col:4,  row:3,  region:"Americas" },
  { iso2:"EC", name:"Ecuador",        col:0,  row:4,  region:"Americas" },
  { iso2:"PE", name:"Peru",           col:1,  row:4,  region:"Americas" },
  { iso2:"BR", name:"Brazil",         col:2,  row:4,  region:"Americas" },
  { iso2:"BO", name:"Bolivia",        col:3,  row:4,  region:"Americas" },
  { iso2:"PY", name:"Paraguay",       col:4,  row:4,  region:"Americas" },
  { iso2:"UY", name:"Uruguay",        col:0,  row:5,  region:"Americas" },
  { iso2:"AR", name:"Argentina",      col:1,  row:5,  region:"Americas" },
  { iso2:"CL", name:"Chile",          col:2,  row:5,  region:"Americas" },
];

// ── Region layout (x, y offset on the SVG canvas) ────────────────────────────

const CELL_W = 44;
const CELL_H = 28;
const GAP    = 3;
const REGION_PAD = 10;
const LABEL_H = 20;

interface RegionLayout {
  name: string;
  ox: number;  // x offset
  oy: number;  // y offset
}

const REGION_LAYOUTS: RegionLayout[] = [
  { name:"Europe",      ox:0,   oy:0   },
  { name:"Middle East", ox:340, oy:0   },
  { name:"Africa",      ox:550, oy:0   },
  { name:"Asia",        ox:820, oy:0   },
  { name:"Americas",    ox:0,   oy:280 },
];

function regionDims(region: string): { cols: number; rows: number } {
  const cells = COUNTRIES.filter((c) => c.region === region);
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const rows = Math.max(...cells.map((c) => c.row)) + 1;
  return { cols, rows };
}

// ── SVG World Map ──────────────────────────────────────────────────────────────

interface CountryMapProps {
  riskMap: Record<string, { score: number; risk: string }>;
  highlighted: string;
  onSelect: (_iso2: string, _name: string) => void;
}

function CountryMap({ riskMap, highlighted, onSelect }: CountryMapProps) {
  const totalW = 1060;
  const totalH = 580;

  return (
    <svg
      viewBox={`0 0 ${totalW} ${totalH}`}
      className="w-full h-auto"
      style={{ background: "transparent" }}
      aria-label="Country risk heat-map"
    >
      {REGION_LAYOUTS.map((rl) => {
        const { cols, rows } = regionDims(rl.name);
        const rw = cols * (CELL_W + GAP) + REGION_PAD * 2;
        const rh = LABEL_H + rows * (CELL_H + GAP) + REGION_PAD * 2;
        const cells = COUNTRIES.filter((c) => c.region === rl.name);
        return (
          <g key={rl.name} transform={`translate(${rl.ox},${rl.oy})`}>
            {/* Region background */}
            <rect
              x={0} y={0}
              width={rw} height={rh}
              rx={6}
              fill="rgba(255,255,255,0.02)"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
            {/* Region label */}
            <text
              x={REGION_PAD}
              y={LABEL_H - 4}
              fontSize={10}
              fontFamily="var(--font-mono, monospace)"
              letterSpacing="0.1em"
              fill="rgba(255,255,255,0.3)"
              textAnchor="start"
            >
              {rl.name.toUpperCase()}
            </text>
            {/* Country cells */}
            {cells.map((cell) => {
              const x = REGION_PAD + cell.col * (CELL_W + GAP);
              const y = LABEL_H + REGION_PAD + cell.row * (CELL_H + GAP);
              const info = riskMap[cell.iso2];
              const fill = info ? RISK_FILL[info.risk] : RISK_FILL["unknown"];
              const isHighlighted = highlighted === cell.iso2;
              return (
                <g
                  key={cell.iso2}
                  transform={`translate(${x},${y})`}
                  onClick={() => onSelect(cell.iso2, cell.name)}
                  style={{ cursor: "pointer" }}
                  role="button"
                  aria-label={`${cell.name} — ${info?.risk ?? "unknown"} risk`}
                >
                  <rect
                    x={0} y={0}
                    width={CELL_W} height={CELL_H}
                    rx={3}
                    fill={fill}
                    fillOpacity={isHighlighted ? 1 : 0.75}
                    stroke={isHighlighted ? "#fff" : "rgba(0,0,0,0.2)"}
                    strokeWidth={isHighlighted ? 2 : 0.5}
                  />
                  <text
                    x={CELL_W / 2}
                    y={CELL_H / 2 + 4}
                    fontSize={9}
                    fontFamily="var(--font-mono, monospace)"
                    fontWeight="700"
                    fill={isHighlighted ? "#fff" : "rgba(0,0,0,0.8)"}
                    textAnchor="middle"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {cell.iso2}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

// ── Static seed risk data (populated on first load / map click) ───────────────

const SEED_RISK: Record<string, { score: number; risk: "low" | "medium" | "high" | "critical" }> = {
  // Low risk
  NO:{ score:8,  risk:"low" }, SE:{ score:9,  risk:"low" }, FI:{ score:10, risk:"low" },
  DK:{ score:10, risk:"low" }, CH:{ score:12, risk:"low" }, NZ:{ score:9,  risk:"low" },
  AU:{ score:14, risk:"low" }, CA:{ score:15, risk:"low" }, GB:{ score:18, risk:"low" },
  IE:{ score:16, risk:"low" }, NL:{ score:17, risk:"low" }, AT:{ score:18, risk:"low" },
  LU:{ score:15, risk:"low" }, SG:{ score:20, risk:"low" }, JP:{ score:19, risk:"low" },
  DE:{ score:18, risk:"low" }, IS:{ score:11, risk:"low" }, FR:{ score:22, risk:"low" },
  US:{ score:24, risk:"low" }, KR:{ score:22, risk:"low" }, TW:{ score:21, risk:"low" },
  // Medium risk
  ES:{ score:28, risk:"medium" }, IT:{ score:32, risk:"medium" }, PT:{ score:26, risk:"medium" },
  GR:{ score:38, risk:"medium" }, PL:{ score:29, risk:"medium" }, CZ:{ score:27, risk:"medium" },
  HU:{ score:36, risk:"medium" }, SK:{ score:30, risk:"medium" }, RO:{ score:40, risk:"medium" },
  BG:{ score:44, risk:"medium" }, HR:{ score:35, risk:"medium" }, SI:{ score:27, risk:"medium" },
  IL:{ score:35, risk:"medium" }, MX:{ score:48, risk:"medium" }, BR:{ score:44, risk:"medium" },
  ZA:{ score:46, risk:"medium" }, AR:{ score:42, risk:"medium" }, CL:{ score:30, risk:"medium" },
  UY:{ score:28, risk:"medium" }, IN:{ score:40, risk:"medium" }, MY:{ score:35, risk:"medium" },
  TH:{ score:43, risk:"medium" }, ID:{ score:45, risk:"medium" }, TR:{ score:48, risk:"medium" },
  EE:{ score:26, risk:"medium" }, LV:{ score:33, risk:"medium" }, LT:{ score:32, risk:"medium" },
  // High risk
  RU:{ score:72, risk:"high" }, UA:{ score:62, risk:"high" }, BY:{ score:68, risk:"high" },
  NG:{ score:66, risk:"high" }, KE:{ score:58, risk:"high" }, TZ:{ score:55, risk:"high" },
  GH:{ score:52, risk:"high" }, SN:{ score:54, risk:"high" }, MR:{ score:60, risk:"high" },
  PH:{ score:57, risk:"high" }, VN:{ score:56, risk:"high" }, KH:{ score:63, risk:"high" },
  PK:{ score:72, risk:"high" }, BD:{ score:61, risk:"high" }, LB:{ score:70, risk:"high" },
  JO:{ score:55, risk:"high" }, CO:{ score:65, risk:"high" }, PE:{ score:58, risk:"high" },
  BO:{ score:56, risk:"high" }, PY:{ score:60, risk:"high" },
  EG:{ score:62, risk:"high" }, MA:{ score:52, risk:"high" }, DZ:{ score:58, risk:"high" },
  TN:{ score:54, risk:"high" }, AZ:{ score:60, risk:"high" }, GE:{ score:52, risk:"high" },
  IQ:{ score:73, risk:"high" }, KZ:{ score:58, risk:"high" }, UZ:{ score:60, risk:"high" },
  RS:{ score:54, risk:"high" }, BA:{ score:56, risk:"high" }, MK:{ score:53, risk:"high" },
  AL:{ score:57, risk:"high" }, MM:{ score:73, risk:"high" }, HT:{ score:70, risk:"high" },
  // Critical risk
  IR:{ score:95, risk:"critical" }, KP:{ score:98, risk:"critical" }, SY:{ score:91, risk:"critical" },
  SD:{ score:85, risk:"critical" }, LY:{ score:84, risk:"critical" }, SO:{ score:90, risk:"critical" },
  AF:{ score:93, risk:"critical" }, YE:{ score:88, risk:"critical" }, ML:{ score:76, risk:"critical" },
  CD:{ score:80, risk:"critical" }, SS:{ score:87, risk:"critical" }, CF:{ score:84, risk:"critical" },
  CU:{ score:78, risk:"critical" }, VE:{ score:82, risk:"critical" }, NI:{ score:76, risk:"critical" },
  TD:{ score:79, risk:"critical" }, GW:{ score:77, risk:"critical" }, SL:{ score:78, risk:"critical" },
  LR:{ score:79, risk:"critical" }, ZW:{ score:81, risk:"critical" }, ET:{ score:76, risk:"critical" },
};

// ── Detail panel ──────────────────────────────────────────────────────────────

interface DetailPanelProps {
  iso2: string;
  countryName: string;
  detail: CountryRiskResult | null;
  loading: boolean;
  error: string | null;
}

function DetailPanel({ iso2, countryName, detail, loading, error }: DetailPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-ink-2 text-12">
        <span
          className="w-4 h-4 rounded-full border-2 border-brand border-t-transparent shrink-0"
          style={{ animation: "spin 0.8s linear infinite" }}
        />
        Fetching risk data for {countryName}…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red/10 border border-red/20 px-4 py-3 text-12 text-red">
        {error}
      </div>
    );
  }

  if (!detail) {
    // Show seed data for the selected country
    const seed = SEED_RISK[iso2];
    if (!seed) return null;
    const riskClass = RISK_COLORS[seed.risk];
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-24 font-normal text-ink-0 leading-tight">{countryName}</h3>
            <span className="text-11 font-mono text-ink-3">{iso2}</span>
          </div>
          <div className="text-right">
            <div className={`font-mono text-40 font-bold leading-none ${riskClass.split(" ")[0]}`}>
              {seed.score}
            </div>
            <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-11 font-bold border uppercase tracking-wide ${riskClass}`}>
              {seed.risk} risk
            </span>
          </div>
        </div>
        <p className="text-11 text-ink-3 italic">Click map to load live AI risk intelligence.</p>
      </div>
    );
  }

  const displayRisk = detail.overallRisk ?? detail.riskLevel ?? "medium";
  const riskClass = RISK_COLORS[displayRisk as keyof typeof RISK_COLORS] ?? RISK_COLORS.medium;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-24 font-normal text-ink-0 leading-tight">
            {detail.countryName ?? countryName}
          </h3>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className="text-11 font-mono text-ink-3">{iso2}</span>
            <span className={`px-2 py-0.5 rounded-full text-11 font-semibold border ${
              RISK_COLORS[detail.fatfStatus?.includes("black") ? "critical" : detail.fatfStatus?.includes("grey") ? "medium" : "low"] ?? RISK_COLORS.low
            }`}>
              {FATF_LABELS[detail.fatfStatus ?? ""] ?? detail.fatfStatus ?? "—"}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`font-mono text-40 font-bold leading-none ${riskClass.split(" ")[0]}`}>
            {detail.riskScore}
          </div>
          <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-11 font-bold border uppercase tracking-wide ${riskClass}`}>
            {displayRisk} risk
          </span>
        </div>
      </div>

      {detail.summary && (
        <div className="border-l-2 border-brand pl-3 text-12 text-ink-1 leading-relaxed">
          {detail.summary}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-11">
        <div className="bg-bg-1 border border-hair-2 rounded p-3">
          <div className="text-10 uppercase tracking-wide-4 text-ink-3 font-semibold mb-1">Sanctions</div>
          <div className="flex flex-wrap gap-1">
            {(detail.activeSanctionsRegimes ?? []).length > 0 ? (
              detail.activeSanctionsRegimes.map((r) => (
                <span key={r} className="text-10 px-1.5 py-0.5 bg-red/10 border border-red/20 rounded text-red font-semibold">{r}</span>
              ))
            ) : (
              <span className="text-green text-10 font-semibold">None active</span>
            )}
          </div>
        </div>
        <div className="bg-bg-1 border border-hair-2 rounded p-3">
          <div className="text-10 uppercase tracking-wide-4 text-ink-3 font-semibold mb-1">Recommendation</div>
          <span className={`text-10 px-2 py-0.5 rounded border font-bold uppercase tracking-wide ${
            detail.recommendation === "prohibited" ? RISK_COLORS.critical :
            detail.recommendation === "senior_approval" ? RISK_COLORS.high :
            detail.recommendation === "enhanced_dd" ? RISK_COLORS.medium : RISK_COLORS.low
          }`}>
            {detail.recommendation?.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {(detail.keyRisks ?? []).length > 0 && (
        <div className="bg-bg-1 border border-hair-2 rounded p-3">
          <div className="text-10 uppercase tracking-wide-4 text-ink-3 font-semibold mb-2">Key Risks</div>
          <ul className="space-y-1">
            {(detail.keyRisks ?? []).slice(0, 4).map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-11 text-ink-1">
                <span className="text-red mt-0.5 shrink-0 font-bold">▸</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CountryRiskMapPage() {
  const [riskMap, setRiskMap] = useState<Record<string, { score: number; risk: string }>>(SEED_RISK);
  const [highlighted, setHighlighted] = useState("");
  const [selectedIso2, setSelectedIso2] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [detail, setDetail] = useState<CountryRiskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Highlight search match
  useEffect(() => {
    if (!search.trim()) {
      setHighlighted("");
      return;
    }
    const q = search.trim().toUpperCase();
    const match = COUNTRIES.find(
      (c) => c.iso2 === q || c.name.toUpperCase().startsWith(q),
    );
    setHighlighted(match?.iso2 ?? "");
  }, [search]);

  const fetchDetail = useCallback(async (iso2: string, name: string) => {
    setSelectedIso2(iso2);
    setSelectedName(name);
    setDetail(null);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/country-risk?country=${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: name, analysisDepth: "quick" }),
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status));
      const data = await res.json().catch(() => ({})) as CountryRiskResult & { error?: string };
      if (!mountedRef.current) return;
      if (data.error) throw new Error(data.error);
      setDetail(data as CountryRiskResult);
      // Update map colour from live data
      if (data.riskScore != null) {
        setRiskMap((prev) => ({
          ...prev,
          [iso2]: { score: data.riskScore, risk: scoreToRisk(data.riskScore) },
        }));
      }
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : "Failed to load risk data");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const handleSelect = useCallback((iso2: string, name: string) => {
    setHighlighted(iso2);
    void fetchDetail(iso2, name);
  }, [fetchDetail]);

  return (
    <ModuleLayout engineLabel="Country risk engine" asanaModule="country-risk-map" asanaLabel="Country Risk Map">
      <ModuleHero
        eyebrow="AML/CFT Intelligence · FATF · Sanctions · Geopolitical"
        title="Country Risk"
        titleEm="Heat-Map."
        kpis={[
          { value: "195+", label: "Countries mapped" },
          { value: "23",   label: "High-risk flagged",  tone: "red" },
          { value: "21",   label: "FATF grey-list",     tone: "amber" },
          { value: "5",    label: "Sanctioned states",  tone: "red" },
        ]}
        intro={
          <>
            Interactive world risk map — click any country cell to load live AI-powered risk intelligence
            covering FATF status, active sanctions regimes, Basel AML Index, and due-diligence obligations.
          </>
        }
      />
      <ModuleFamilyBar suiteName="Country & Geopolitical Risk" modules={[
        { label: "Country Risk", href: "/country-risk",     icon: "🌍" },
        { label: "Risk Map",     href: "/country-risk-map", icon: "🗺️" },
        { label: "Geopolitical", href: "/geopolitical",     icon: "🌏" },
      ]} />

      {/* Search + legend row */}
      <div className="flex flex-wrap items-center gap-4 mb-5">
        <div className="flex-1 min-w-[180px] max-w-xs">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search country or ISO code…"
            className="w-full bg-bg-1 border border-hair-2 rounded-lg px-3 py-2 text-12 text-ink-0 outline-none focus:border-brand transition-colors placeholder:text-ink-3"
          />
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(RISK_LABEL).map(([risk, label]) => (
            <span key={risk} className="flex items-center gap-1.5 text-11 text-ink-2">
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ background: RISK_FILL[risk] }}
              />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-11 text-ink-2">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: RISK_FILL["unknown"] }} />
            Unscored
          </span>
        </div>
      </div>

      {/* Map */}
      <div className="bg-bg-1 border border-hair-2 rounded-xl p-4 mb-5 overflow-x-auto">
        <CountryMap
          riskMap={riskMap}
          highlighted={highlighted}
          onSelect={handleSelect}
        />
      </div>

      {/* Detail panel */}
      {selectedIso2 && (
        <div className="bg-bg-1 border border-hair-2 rounded-xl p-5">
          <div className="text-11 uppercase tracking-wide-4 text-ink-2 font-semibold mb-3 pb-2 border-b border-hair">
            Country Intelligence — {selectedIso2}
          </div>
          <DetailPanel
            iso2={selectedIso2}
            countryName={selectedName}
            detail={detail}
            loading={loading}
            error={error}
          />
        </div>
      )}

      {!selectedIso2 && (
        <div className="text-center py-8 text-ink-3">
          <div className="text-10 uppercase tracking-wide-4 font-semibold mb-1">Click a country cell above to load risk intelligence</div>
          <div className="text-11 text-ink-3">Cells are coloured by seed risk score — live AI data loads on click.</div>
        </div>
      )}
    </ModuleLayout>
  );
}
