/**
 * Minimal zero-dependency PDF writer for text artefacts.
 *
 * Produces a valid PDF 1.4 document with Courier 10pt monospace text,
 * line wrapping at 84 characters, automatic pagination, and no images.
 * This is enough for audit-grade archival of every artefact the
 * compliance automation produces.
 *
 * No npm dependencies. Runs on plain Node.js 20 and above.
 *
 * Usage:
 *   import { writePdf } from "./lib/pdf-writer.mjs";
 *   await writePdf(documentText, "/absolute/path/to/output.pdf");
 */

import { writeFile } from "node:fs/promises";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const FONT_SIZE = 10;
const LINE_HEIGHT = 12;
const CHAR_WIDTH = 6; // Courier 10pt glyph width
const USABLE_W = PAGE_W - 2 * MARGIN;
const MAX_CHARS = Math.floor(USABLE_W / CHAR_WIDTH); // 84
const MAX_LINES = Math.floor((PAGE_H - 2 * MARGIN) / LINE_HEIGHT); // 57

function escapePdfString(s) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapLine(line) {
  if (line.length <= MAX_CHARS) return [line];
  const out = [];
  let s = line;
  while (s.length > MAX_CHARS) {
    let breakAt = s.lastIndexOf(" ", MAX_CHARS);
    if (breakAt <= 0) breakAt = MAX_CHARS;
    out.push(s.slice(0, breakAt));
    s = s.slice(breakAt).replace(/^\s+/, "");
  }
  if (s.length > 0) out.push(s);
  return out;
}

function normalizeText(text) {
  return String(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .split("\n")
    .map((l) => l.replace(/[^\x20-\x7E]/g, " "));
}

function paginate(text) {
  const normalized = normalizeText(text);
  const wrapped = [];
  for (const line of normalized) wrapped.push(...wrapLine(line));
  if (wrapped.length === 0) wrapped.push("");
  const pages = [];
  for (let i = 0; i < wrapped.length; i += MAX_LINES) {
    pages.push(wrapped.slice(i, i + MAX_LINES));
  }
  return pages;
}

function buildContentStream(lines) {
  const ops = [
    "BT",
    `/F1 ${FONT_SIZE} Tf`,
    `${LINE_HEIGHT} TL`,
    `${MARGIN} ${PAGE_H - MARGIN - FONT_SIZE} Td`,
  ];
  lines.forEach((line, i) => {
    const s = escapePdfString(line);
    if (i === 0) {
      ops.push(`(${s}) Tj`);
    } else {
      ops.push("T*");
      ops.push(`(${s}) Tj`);
    }
  });
  ops.push("ET");
  return ops.join("\n");
}

export function renderPdfBuffer(text) {
  const pages = paginate(text);
  const N = pages.length;
  const fontId = 3 + N;

  const objects = [];
  objects.push({ id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" });

  const kids = [];
  for (let i = 0; i < N; i++) kids.push(`${3 + i} 0 R`);
  objects.push({
    id: 2,
    body: `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${N} >>`,
  });

  for (let i = 0; i < N; i++) {
    const contentId = 4 + N + i;
    objects.push({
      id: 3 + i,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    });
  }

  objects.push({
    id: fontId,
    body: "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  });

  for (let i = 0; i < N; i++) {
    const stream = buildContentStream(pages[i]);
    const length = Buffer.byteLength(stream, "binary");
    objects.push({
      id: 4 + N + i,
      body: `<< /Length ${length} >>\nstream\n${stream}\nendstream`,
    });
  }

  objects.sort((a, b) => a.id - b.id);

  const header = "%PDF-1.4\n%\xFF\xFF\xFF\xFF\n";
  const chunks = [header];
  const offsets = new Map();
  let pos = Buffer.byteLength(header, "binary");

  for (const obj of objects) {
    offsets.set(obj.id, pos);
    const s = `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
    chunks.push(s);
    pos += Buffer.byteLength(s, "binary");
  }

  const xrefPos = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    const off = offsets.get(i) ?? 0;
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  chunks.push(xref);

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  chunks.push(trailer);

  return Buffer.from(chunks.join(""), "binary");
}

export async function writePdf(text, outPath) {
  const buf = renderPdfBuffer(text);
  await writeFile(outPath, buf);
  return outPath;
}
