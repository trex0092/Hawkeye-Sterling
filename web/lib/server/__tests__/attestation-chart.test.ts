import { describe, expect, it } from "vitest";
import {
  composeStatusCardSvg,
  composeSummaryGridSvg,
  renderPng,
  type StatusCardInput,
} from "@/lib/server/attestation-chart";

const BASE: StatusCardInput = {
  num: "2.01",
  label: "Screening",
  group: "riskops",
  date: "2026-06-10",
  ref: "HS-ATT-2026-06-10-screening",
  state: "C",
  statusLine: "Operational",
  findingsLine: "No control exceptions, breaches or overdue items recorded in the audit chain.",
  cadence: "At onboarding, on transactions, on list updates",
  owner: "Compliance Officer; MLRO on hits",
  retention: "5 yrs",
  history: [
    { date: "2026-06-08", state: "C" },
    { date: "2026-06-09", state: "A" },
  ],
};

describe("attestation status card", () => {
  it("is deterministic — identical inputs render identical SVG", () => {
    expect(composeStatusCardSvg(BASE)).toBe(composeStatusCardSvg({ ...BASE }));
  });

  it("carries the attestation reference, schedule line and statute", () => {
    const svg = composeStatusCardSvg(BASE);
    expect(svg).toContain("HS-ATT-2026-06-10-screening");
    expect(svg).toContain("09:30 GST");
    expect(svg).toContain("Federal Decree-Law No. 10 of 2025 Art.24");
    expect(svg).toContain("2.01");
  });

  it("renders the three states with distinct banners", () => {
    expect(composeStatusCardSvg({ ...BASE, state: "C" })).toContain("CLEAN — COMPLIANT");
    expect(composeStatusCardSvg({ ...BASE, state: "A" })).toContain("ACTIVE — MONITORING");
    expect(composeStatusCardSvg({ ...BASE, state: "E" })).toContain("EXCEPTION — ACTION REQUIRED");
    expect(composeStatusCardSvg({ ...BASE, state: "M", ref: "HS-MAN-2026-06-10-screening" })).toContain(
      "MANUAL ATTESTATION",
    );
  });

  it("escapes module text for SVG safety", () => {
    const svg = composeStatusCardSvg({ ...BASE, label: 'A<b>&"x' });
    expect(svg).not.toContain("A<b>");
    expect(svg).toContain("A&lt;b&gt;&amp;&quot;x");
  });

  it("pads the 7-day strip with hollow slots and includes today", () => {
    const svg = composeStatusCardSvg({ ...BASE, history: [] });
    expect(svg.match(/stroke="#cbd5e1"/g)?.length).toBe(6);
    expect(svg).toContain('fill="#1e7a52"');
  });

  it("rasterises to a real PNG", () => {
    const png = renderPng(composeStatusCardSvg(BASE));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.length).toBeGreaterThan(5_000);
  });
});

describe("daily summary grid", () => {
  it("counts states and names every module", () => {
    const svg = composeSummaryGridSvg("2026-06-10", [
      { num: "1.01", state: "C" },
      { num: "2.01", state: "E" },
      { num: "3.01", state: "A" },
    ]);
    expect(svg).toContain("1 clean");
    expect(svg).toContain("1 active");
    expect(svg).toContain("1 exception");
    expect(svg).toContain("1.01");
    expect(svg).toContain("3.01");
  });
});
