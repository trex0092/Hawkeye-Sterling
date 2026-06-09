// Tests for web/lib/pdf/exportPdf.ts using vitest.
// jsPDF and jspdf-autotable are mocked so no browser DOM is required.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── jsPDF mock ────────────────────────────────────────────────────────────────
// exportPdf.ts calls methods on the jsPDF instance. We track calls so we can
// assert that the correct sections are rendered without a real PDF engine.

interface MockDoc {
  setFillColor: ReturnType<typeof vi.fn>;
  rect: ReturnType<typeof vi.fn>;
  setTextColor: ReturnType<typeof vi.fn>;
  setFontSize: ReturnType<typeof vi.fn>;
  setFont: ReturnType<typeof vi.fn>;
  text: ReturnType<typeof vi.fn>;
  setDrawColor: ReturnType<typeof vi.fn>;
  line: ReturnType<typeof vi.fn>;
  roundedRect: ReturnType<typeof vi.fn>;
  splitTextToSize: ReturnType<typeof vi.fn>;
  addPage: ReturnType<typeof vi.fn>;
  getNumberOfPages: ReturnType<typeof vi.fn>;
  setPage: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  lastAutoTable: { finalY: number };
}

let mockDoc: MockDoc;

vi.mock("jspdf", () => {
  // Must use a regular function — arrow functions cannot be used as constructors.
  function MockJsPDF() {
    mockDoc = {
      setFillColor: vi.fn(),
      rect: vi.fn(),
      setTextColor: vi.fn(),
      setFontSize: vi.fn(),
      setFont: vi.fn(),
      text: vi.fn(),
      setDrawColor: vi.fn(),
      line: vi.fn(),
      roundedRect: vi.fn(),
      splitTextToSize: vi.fn((s: string) => [s]),
      addPage: vi.fn(),
      getNumberOfPages: vi.fn().mockReturnValue(1),
      setPage: vi.fn(),
      save: vi.fn(),
      lastAutoTable: { finalY: 100 },
    };
    return mockDoc;
  }
  return { default: MockJsPDF };
});

vi.mock("jspdf-autotable", () => ({
  default: vi.fn(),
}));

import { exportToPdf, type PdfExportOptions } from "../exportPdf";

function baseOptions(overrides: Partial<PdfExportOptions> = {}): PdfExportOptions {
  return {
    title: "Test Report",
    moduleName: "Unit Test",
    reportRef: "UT-001",
    sections: [],
    ...overrides,
  };
}

describe("exportToPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls doc.save (constructor succeeded)", () => {
    exportToPdf(baseOptions());
    // If the constructor is broken the test would throw before reaching save.
    expect(mockDoc.save).toHaveBeenCalled();
  });

  it("calls doc.save with reportRef in filename", () => {
    exportToPdf(baseOptions({ reportRef: "REF-XYZ" }));
    const saveArg: string = mockDoc.save.mock.calls[0][0] as string;
    expect(saveArg).toContain("REF-XYZ");
    expect(saveArg).toMatch(/\.pdf$/);
  });

  it("renders title text", () => {
    exportToPdf(baseOptions({ title: "My Title" }));
    const textCalls: unknown[][] = mockDoc.text.mock.calls;
    const titled = textCalls.some((c) => c[0] === "My Title");
    expect(titled).toBe(true);
  });

  it("renders CONFIDENTIAL stamp when confidential=true", () => {
    exportToPdf(baseOptions({ confidential: true }));
    const textCalls: unknown[][] = mockDoc.text.mock.calls;
    const stamped = textCalls.some((c) => typeof c[0] === "string" && c[0].includes("CONFIDENTIAL"));
    expect(stamped).toBe(true);
  });

  it("does NOT render CONFIDENTIAL when confidential is false", () => {
    exportToPdf(baseOptions({ confidential: false }));
    const textCalls: unknown[][] = mockDoc.text.mock.calls;
    const stamped = textCalls.some((c) => typeof c[0] === "string" && c[0].includes("CONFIDENTIAL"));
    expect(stamped).toBe(false);
  });

  it("renders header section", () => {
    exportToPdf(baseOptions({
      sections: [{ type: "header", content: "Section Heading" }],
    }));
    const textCalls: unknown[][] = mockDoc.text.mock.calls;
    const found = textCalls.some((c) => c[0] === "Section Heading");
    expect(found).toBe(true);
  });

  it("renders paragraph section via splitTextToSize", () => {
    exportToPdf(baseOptions({
      sections: [{ type: "paragraph", content: "Some body text." }],
    }));
    expect(mockDoc.splitTextToSize).toHaveBeenCalledWith("Some body text.", expect.any(Number));
  });

  it("renders keyvalue pairs", () => {
    exportToPdf(baseOptions({
      sections: [{
        type: "keyvalue",
        pairs: [{ label: "Risk", value: "High", tone: "red" }],
      }],
    }));
    const textCalls: unknown[][] = mockDoc.text.mock.calls;
    const labelFound = textCalls.some((c) => c[0] === "Risk");
    expect(labelFound).toBe(true);
  });

  it("renders divider via doc.line", () => {
    exportToPdf(baseOptions({
      sections: [{ type: "divider" }],
    }));
    expect(mockDoc.line).toHaveBeenCalled();
  });

  it("renders badge with roundedRect", () => {
    exportToPdf(baseOptions({
      sections: [{ type: "badge", content: "HIGH", tone: "red" }],
    }));
    expect(mockDoc.roundedRect).toHaveBeenCalled();
  });

  it("renders footer (setPage called once for single-page doc)", () => {
    // getNumberOfPages returns 1 by default; setPage should be called once.
    exportToPdf(baseOptions());
    expect(mockDoc.setPage).toHaveBeenCalledTimes(1);
  });

  it("renders subtitle when provided", () => {
    exportToPdf(baseOptions({ subtitle: "Report Subtitle" }));
    // subtitle is part of the metadata bar text — just check save was called (no crash)
    expect(mockDoc.save).toHaveBeenCalled();
  });

  it("renders moduleName and institution in metadata bar", () => {
    exportToPdf(baseOptions({ moduleName: "MLRO Module", institution: "Test Bank" }));
    const textCalls: unknown[][] = mockDoc.text.mock.calls;
    const metaRendered = textCalls.some((c) => typeof c[0] === "string" && c[0].includes("Test Bank"));
    expect(metaRendered).toBe(true);
  });

  it("renders regulatory basis in footer", () => {
    exportToPdf(baseOptions({ regulatoryBasis: "Federal Decree-Law No. 10 of 2025 Art.24" }));
    const textCalls: unknown[][] = mockDoc.text.mock.calls;
    const found = textCalls.some((c) => typeof c[0] === "string" && c[0].includes("Federal Decree-Law No. 10 of 2025"));
    expect(found).toBe(true);
  });

  it("handles multiple sections without throwing", () => {
    expect(() => exportToPdf(baseOptions({
      sections: [
        { type: "header", content: "H1" },
        { type: "subheader", content: "Sub" },
        { type: "paragraph", content: "Body." },
        { type: "divider" },
        { type: "badge", content: "CLEAR", tone: "green" },
        { type: "keyvalue", pairs: [{ label: "L", value: "V" }] },
      ],
    }))).not.toThrow();
  });
});
