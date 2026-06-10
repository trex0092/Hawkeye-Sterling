// Hawkeye Sterling — export safety unit tests.
// Covers CSV injection prevention and HTML sanitization.
// Rules: OWASP A03 (Injection), A07 (XSS).

import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "../utils/sanitizeHtml.js";
import { escapeCsvCell } from "../utils/escapeCsvCell.js";

describe("escapeCsvCell — CSV injection prevention", () => {
  it("prepends single-quote to cells starting with =", () => {
    expect(escapeCsvCell("=CMD|/C calc")).toBe(`"'=CMD|/C calc"`);
  });

  it("prepends single-quote to cells starting with +", () => {
    expect(escapeCsvCell("+1-800-FRAUD")).toBe(`"'+1-800-FRAUD"`);
  });

  it("prepends single-quote to cells starting with -", () => {
    expect(escapeCsvCell("-cmd.exe")).toBe(`"'-cmd.exe"`);
  });

  it("prepends single-quote to cells starting with @", () => {
    expect(escapeCsvCell("@SUM(1+1)")).toBe(`"'@SUM(1+1)"`);
  });

  it("prepends single-quote to cells starting with tab", () => {
    expect(escapeCsvCell("\t=FORMULA")).toBe(`"'	=FORMULA"`);
  });

  it("does not prepend to normal text", () => {
    expect(escapeCsvCell("Normal Corp Ltd")).toBe(`"Normal Corp Ltd"`);
  });

  it("does not prepend to text that contains = in the middle", () => {
    expect(escapeCsvCell("Score=95")).toBe(`"Score=95"`);
  });

  it("strips null bytes from cell values", () => {
    expect(escapeCsvCell("evil\x00name")).toBe(`"evilname"`);
  });

  it("strips control characters but preserves printable text", () => {
    expect(escapeCsvCell("evil\x07name")).toBe(`"evil name"`);
  });

  it("doubles inner double-quotes (standard CSV escaping)", () => {
    expect(escapeCsvCell(`He said "hello"`)).toBe(`"He said ""hello"""`);
  });

  it("handles null and undefined gracefully", () => {
    expect(escapeCsvCell(null)).toBe(`""`);
    expect(escapeCsvCell(undefined)).toBe(`""`);
  });

  it("handles numeric values", () => {
    expect(escapeCsvCell(95)).toBe(`"95"`);
  });

  it("handles boolean values", () => {
    expect(escapeCsvCell(true)).toBe(`"true"`);
  });

  it("wraps empty string in quotes", () => {
    expect(escapeCsvCell("")).toBe(`""`);
  });

  it("handles long values without truncation", () => {
    const long = "A".repeat(1000);
    const result = escapeCsvCell(long);
    expect(result).toBe(`"${long}"`);
  });
});

describe("sanitizeHtml — XSS prevention", () => {
  it("escapes < and > characters", () => {
    expect(sanitizeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("escapes & to prevent HTML entity injection", () => {
    expect(sanitizeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("escapes double quotes", () => {
    expect(sanitizeHtml(`He said "hello"`)).toBe("He said &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(sanitizeHtml("O'Brien")).toBe("O&#x27;Brien");
  });

  it("handles already-safe strings without double-escaping", () => {
    expect(sanitizeHtml("Hello World")).toBe("Hello World");
  });

  it("handles empty string", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("handles multiple attack vectors in one string", () => {
    const input = `<img src="x" onerror="alert('xss')">`;
    const output = sanitizeHtml(input);
    expect(output).not.toContain("<");
    expect(output).not.toContain(">");
    expect(output).not.toContain(`"`);
    expect(output).not.toContain("'");
  });

  it("escapes & before < to prevent double escaping issues", () => {
    expect(sanitizeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("handles a realistic news snippet with HTML", () => {
    const snippet = 'Breaking: <b>"Company X"</b> fined $5M for violations & non-compliance';
    const result = sanitizeHtml(snippet);
    expect(result).not.toContain("<b>");
    expect(result).not.toContain("</b>");
    expect(result).toContain("&lt;b&gt;");
    expect(result).toContain("&amp;");
    expect(result).toContain("&quot;");
  });
});
