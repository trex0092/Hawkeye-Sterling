"use client";
// Shared PDF design system for Hawkeye Sterling cover-style reports.
import jsPDF from "jspdf";

export const PW = 595;        // A4 portrait width (pt)
export const PH = 842;        // A4 portrait height (pt)
export const ML = 40;         // left margin
export const MR = 40;         // right margin
export const CW = PW - ML - MR; // content width: 515pt
export const CONTENT_Y = 74; // content start y on content pages (below header)
export const BOTTOM_Y = 730; // max y before signature footer zone

export const PINK:   [number,number,number] = [210,  0, 85];
export const BLACK:  [number,number,number] = [ 20, 20, 20];
export const GRAY_D: [number,number,number] = [ 70, 70, 70];
export const GRAY_M: [number,number,number] = [130,130,130];
export const GRAY_L: [number,number,number] = [200,200,200];
export const WHITE:  [number,number,number] = [255,255,255];

function t(doc: jsPDF, c: [number,number,number]) { doc.setTextColor(c[0],c[1],c[2]); }
function f(doc: jsPDF, c: [number,number,number]) { doc.setFillColor(c[0],c[1],c[2]); }
function d(doc: jsPDF, c: [number,number,number]) { doc.setDrawColor(c[0],c[1],c[2]); }

export function securityStrip(doc: jsPDF, y: number, ref: string) {
  doc.setFont("helvetica","normal"); doc.setFontSize(5.5); t(doc,GRAY_M);
  const seg = `HAWKEYE STERLING  ·  ${ref}  ·  CONFIDENTIAL  ·  DO NOT REDISTRIBUTE  `;
  const sw = doc.getTextWidth(seg);
  for (let x = 0; x < PW + sw; x += sw) doc.text(seg, x, y + 8);
}

export function headerBar(doc: jsPDF, ref: string, y: number) {
  f(doc,WHITE); doc.rect(0,y,PW,28,"F");
  d(doc,GRAY_L); doc.setLineWidth(0.4); doc.line(0,y+28,PW,y+28);
  // Small circle logo
  d(doc,BLACK); doc.setLineWidth(0.6); doc.circle(ML+7,y+14,5,"S");
  doc.setFont("helvetica","bold"); doc.setFontSize(7); t(doc,BLACK);
  doc.text("H", ML+7, y+16.5, {align:"center"});
  // Brand name
  doc.setFont("helvetica","bold"); doc.setFontSize(8); t(doc,BLACK);
  doc.setCharSpace(1.5); doc.text("HAWKEYE  ·  STERLING", ML+16, y+17); doc.setCharSpace(0);
  // Confidential (pink)
  doc.setFont("helvetica","bold"); doc.setFontSize(7); t(doc,PINK);
  doc.setCharSpace(0.8); doc.text("CONFIDENTIAL  ·  MLRO USE ONLY", PW/2, y+17, {align:"center"}); doc.setCharSpace(0);
  // Report ref
  doc.setFont("helvetica","normal"); doc.setFontSize(7.5); t(doc,BLACK);
  doc.setCharSpace(0.5); doc.text(ref, PW-MR, y+17, {align:"right"}); doc.setCharSpace(0);
}

export function coverFrame(doc: jsPDF, ref: string) {
  securityStrip(doc, 0, ref);
  headerBar(doc, ref, 12);
  d(doc,GRAY_L); doc.setLineWidth(0.3); doc.line(ML,56,PW-MR,56);
}

export function contentFrame(
  doc: jsPDF, ref: string, regLine1: string, regLine2: string, pageNo: number, total: number
): number {
  f(doc,WHITE); doc.rect(0,0,PW,18,"F");
  doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setCharSpace(0.5); t(doc,GRAY_D);
  doc.text(regLine1, ML, 7);
  if (regLine2) doc.text(regLine2, ML, 13.5);
  doc.text(ref, PW/2, 10, {align:"center"});
  doc.text(`${String(pageNo).padStart(2,"0")} / ${String(total).padStart(2,"0")}`, PW-MR, 10, {align:"right"});
  doc.setCharSpace(0);
  d(doc,GRAY_L); doc.setLineWidth(0.3); doc.line(0,18,PW,18);
  securityStrip(doc, 18, ref);
  headerBar(doc, ref, 30);
  return CONTENT_Y;
}

export function coverLogo(doc: jsPDF, cx: number, cy: number) {
  d(doc,BLACK); doc.setLineWidth(0.8); doc.circle(cx,cy,22,"S");
  doc.setLineWidth(0.3); doc.circle(cx,cy,14,"S");
  doc.setFont("helvetica","bold"); doc.setFontSize(12); t(doc,BLACK);
  doc.text("HS", cx, cy+4.5, {align:"center"});
}

export function smallLogo(doc: jsPDF, cx: number, cy: number) {
  d(doc,GRAY_M); doc.setLineWidth(0.5); doc.circle(cx,cy,5.5,"S");
  doc.setFont("helvetica","bold"); doc.setFontSize(6.5); t(doc,GRAY_M);
  doc.text("H", cx, cy+2.2, {align:"center"});
}

export function dropCapTitle(doc: jsPDF, cap: string, rest: string, y: number) {
  doc.setFont("times","italic");
  doc.setFontSize(40); t(doc,PINK); const capW = doc.getTextWidth(cap);
  doc.setFontSize(28); t(doc,BLACK); const restW = doc.getTextWidth(rest);
  const sx = Math.max(ML, (PW - capW - restW) / 2);
  doc.setFontSize(40); t(doc,PINK); doc.text(cap, sx, y);
  doc.setFontSize(28); t(doc,BLACK); doc.text(rest, sx + capW, y);
}

export interface CardDef { label: string; title: string; tags: string }
export interface RightCardDef { label: string; value: string; sub?: string }

export function twoCards(doc: jsPDF, y: number, left: CardDef, right: RightCardDef): number {
  const H=115, GAP=16, W=(CW-GAP)/2, X1=ML, X2=ML+W+GAP;
  d(doc,GRAY_L); doc.setLineWidth(0.5); doc.rect(X1,y,W,H,"S"); doc.rect(X2,y,W,H,"S");
  // Left label
  doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setCharSpace(1.5); t(doc,GRAY_M);
  doc.text(left.label, X1+12, y+18); doc.setCharSpace(0);
  // Left title
  doc.setFont("helvetica","bold"); doc.setFontSize(14); t(doc,BLACK);
  const tl = doc.splitTextToSize(left.title, W-24); doc.text(tl, X1+12, y+34);
  // Left tags
  doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setCharSpace(0.8); t(doc,GRAY_D);
  doc.text(doc.splitTextToSize(left.tags, W-24), X1+12, y+34+tl.length*17+6); doc.setCharSpace(0);
  // Right label
  doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setCharSpace(1.5); t(doc,GRAY_M);
  doc.text(right.label, X2+12, y+18); doc.setCharSpace(0);
  // Right value
  doc.setFont("helvetica","bold"); doc.setFontSize(20); t(doc,PINK); doc.text(right.value, X2+12, y+46);
  if (right.sub) {
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); t(doc,GRAY_D);
    doc.text(doc.splitTextToSize(right.sub, W-24), X2+12, y+62);
  }
  return y+H+20;
}

export function oneCard(doc: jsPDF, y: number, card: CardDef): number {
  const H=115, W=(CW-16)/2;
  d(doc,GRAY_L); doc.setLineWidth(0.5); doc.rect(ML,y,W,H,"S");
  doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setCharSpace(1.5); t(doc,GRAY_M);
  doc.text(card.label, ML+12, y+18); doc.setCharSpace(0);
  doc.setFont("helvetica","bold"); doc.setFontSize(14); t(doc,BLACK);
  const tl = doc.splitTextToSize(card.title, W-24); doc.text(tl, ML+12, y+34);
  doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setCharSpace(0.8); t(doc,GRAY_D);
  doc.text(doc.splitTextToSize(card.tags, W-24), ML+12, y+34+tl.length*17+6); doc.setCharSpace(0);
  return y+H+20;
}

export interface MetaCell { label: string; value: string; sub?: string }

export function metaGrid(doc: jsPDF, y: number, cells: MetaCell[]): number {
  const COL = CW/3;
  cells.forEach((cell,i) => {
    const x = ML + (i%3)*COL, cy = y + Math.floor(i/3)*52;
    doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setCharSpace(1.2); t(doc,GRAY_M);
    doc.text(cell.label, x, cy); doc.setCharSpace(0);
    doc.setFont("helvetica","normal"); doc.setFontSize(9.5); t(doc,BLACK); doc.text(cell.value, x, cy+13);
    if (cell.sub) { doc.setFont("helvetica","normal"); doc.setFontSize(7); t(doc,GRAY_M); doc.text(cell.sub.toUpperCase(), x, cy+23); }
  });
  return y + Math.ceil(cells.length/3)*52 + 10;
}

export function coverFooter(doc: jsPDF) {
  const FY = PH-68;
  d(doc,GRAY_L); doc.setLineWidth(0.3); doc.line(ML,FY,PW-MR,FY);
  doc.setFont("times","italic"); doc.setFontSize(7.5); t(doc,GRAY_D);
  ["Issued in confidence to the addressee. Reproduction,",
   "transmission or storage outside the controlled domain of",
   "the recipient institution is prohibited under the terms of",
   "the engagement."].forEach((ln,i) => doc.text(ln, ML, FY+10+i*10));
  smallLogo(doc, PW-MR-8, PH-25);
}

export function partHeader(doc: jsPDF, label: string, num: string, title: string, y: number): number {
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setCharSpace(2); t(doc,GRAY_M);
  doc.text(label, ML+20, y); doc.setCharSpace(0); y+=14;
  doc.setFont("times","italic"); doc.setFontSize(18); t(doc,PINK);
  const nw = doc.getTextWidth(num); doc.text(num, ML+20, y);
  doc.setFont("helvetica","normal"); doc.setFontSize(14); t(doc,BLACK);
  doc.text("  "+title, ML+20+nw, y); y+=8;
  d(doc,GRAY_L); doc.setLineWidth(0.3); doc.line(ML,y,PW-MR,y);
  return y+14;
}

export function verdictBadge(doc: jsPDF, text: string, y: number): number {
  doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setCharSpace(1.2);
  const w = doc.getTextWidth(text)+20; doc.setCharSpace(0);
  d(doc,PINK); doc.setLineWidth(1); doc.rect(ML,y,w,16,"S");
  doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setCharSpace(1.2); t(doc,PINK);
  doc.text(text, ML+10, y+10.5); doc.setCharSpace(0);
  return y+24;
}

export function kvRows(doc: jsPDF, rows: Array<[string,string]>, y: number, labelW=130): number {
  for (const [lbl,val] of rows) {
    doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setCharSpace(0.8); t(doc,BLACK);
    doc.text(lbl, ML, y); doc.setCharSpace(0);
    doc.setFont("helvetica","normal"); doc.setFontSize(8.5); t(doc,GRAY_D);
    const vl = doc.splitTextToSize(val, CW-labelW); doc.text(vl, ML+labelW, y);
    y += vl.length*11+2;
  }
  return y+8;
}

export function dropCapPara(doc: jsPDF, text: string, y: number): number {
  if (!text) return y;
  const cap=text.charAt(0), rest=text.slice(1);
  doc.setFont("times","italic"); doc.setFontSize(30); t(doc,GRAY_D);
  const capW = doc.getTextWidth(cap); doc.text(cap, ML, y+12);
  doc.setFont("helvetica","normal"); doc.setFontSize(9); t(doc,BLACK);
  const lines = doc.splitTextToSize(rest, CW-capW-4); doc.text(lines, ML+capW+3, y);
  return y + Math.max(lines.length*12,28)+10;
}

export function sigFooter(
  doc: jsPDF, y: number, ref: string,
  signers: Array<{name:string;role:string;id?:string;date?:string;extra?:string}>
) {
  const totalContent = doc.getNumberOfPages()-1;
  const colW = CW/signers.length;
  signers.forEach((sig,i) => {
    const x = ML+i*colW;
    d(doc,GRAY_M); doc.setLineWidth(0.3); doc.line(x,y,x+colW-10,y);
    doc.setFont("times","italic"); doc.setFontSize(9); t(doc,BLACK); doc.text(sig.name, x, y+12);
    doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setCharSpace(0.8); t(doc,GRAY_D);
    doc.text(sig.role, x, y+23); doc.setCharSpace(0);
    let oy=y+32;
    if (sig.id)   { doc.text(sig.id,   x, oy); oy+=9; }
    if (sig.date) { doc.text(sig.date,  x, oy); oy+=9; }
    if (sig.extra){ doc.setCharSpace(0.5); t(doc,GRAY_M); doc.text(sig.extra, x, oy); doc.setCharSpace(0); }
  });
  const finY=y+58;
  doc.setFont("times","italic"); doc.setFontSize(8); t(doc,GRAY_D); doc.text("finis", ML, finY);
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setCharSpace(0.5); t(doc,GRAY_M);
  const n=String(totalContent).padStart(2,"0");
  doc.text(`${ref}  ·  END OF DOCUMENT  ·  ${n} OF ${n}`, PW/2, finY, {align:"center"});
  doc.setCharSpace(0);
  smallLogo(doc, PW-MR-8, finY-2);
}
