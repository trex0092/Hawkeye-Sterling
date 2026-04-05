/**
 * Minimal zero-dependency .docx (Microsoft Word) writer for text artefacts.
 *
 * Produces a valid Open Office XML document that Microsoft Word, Pages,
 * LibreOffice and Google Docs all open natively without a compatibility
 * warning. Uses Courier New 10pt so wide tables and fixed-width tables
 * line up the way they do in the plain text archive.
 *
 * No npm dependencies. Implements the small slice of ZIP (stored, no
 * compression) and CRC32 needed to serialise a conformant .docx package.
 *
 * Usage:
 *   import { writeDocx } from "./lib/docx-writer.mjs";
 *   await writeDocx(documentText, "/absolute/path/to/output.docx");
 */

import { writeFile } from "node:fs/promises";

/* ─── CRC32 table ─────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ─── Tiny ZIP (stored) writer ────────────────────────────────────────── */

function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const data = f.data;
    const crc = crc32(data);
    const size = data.length;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(0, 8);
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0x21, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(size, 18);
    lfh.writeUInt32LE(size, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    parts.push(lfh, nameBuf, data);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(0, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0x21, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(size, 20);
    cdh.writeUInt32LE(size, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42);

    central.push(cdh, nameBuf);
    offset += lfh.length + nameBuf.length + data.length;
  }

  const centralStart = offset;
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, ...central, eocd]);
}

/* ─── XML escape and docx body builder ────────────────────────────────── */

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeForXml(line) {
  // Strip characters invalid in XML 1.0
  // eslint-disable-next-line no-control-regex
  return String(line).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function buildDocumentXml(text) {
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const paras = [];
  for (const rawLine of lines) {
    const line = sanitizeForXml(rawLine);
    if (line.length === 0) {
      paras.push(
        '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>',
      );
    } else {
      paras.push(
        '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>' +
          '<w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="20"/></w:rPr>' +
          `<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`,
      );
    }
  }

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:body>" +
    paras.join("") +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
    '<w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>' +
    "</w:sectPr>" +
    "</w:body>" +
    "</w:document>"
  );
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  "</Types>";

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

export function renderDocxBuffer(text) {
  const documentXml = buildDocumentXml(text);
  const files = [
    { name: "[Content_Types].xml", data: Buffer.from(CONTENT_TYPES, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(ROOT_RELS, "utf8") },
    { name: "word/document.xml", data: Buffer.from(documentXml, "utf8") },
  ];
  return zipStore(files);
}

export async function writeDocx(text, outPath) {
  const buf = renderDocxBuffer(text);
  await writeFile(outPath, buf);
  return outPath;
}
