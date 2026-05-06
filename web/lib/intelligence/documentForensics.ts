// Hawkeye Sterling — document forensics (Layers 161-170).
export interface ImageMetadata {
  jpegQuality?: number; jpegCompressionArtifacts?: number;
  exifDateTaken?: string; exifSoftware?: string; exifGps?: { lat: number; lon: number };
  rotationDegrees?: number; widthPx?: number; heightPx?: number;
}
const FORGERY_SOFTWARE = /\b(adobe\s+photoshop|gimp|paint\.net|affinity|pixelmator)\b/i;
// 161. JPEG quality / compression
export function jpegQualityFlag(m: ImageMetadata): { flagged: boolean; reason?: string } {
  if (typeof m.jpegQuality === "number" && m.jpegQuality < 50) return { flagged: true, reason: `low JPEG quality ${m.jpegQuality}` };
  if (typeof m.jpegCompressionArtifacts === "number" && m.jpegCompressionArtifacts > 0.3) return { flagged: true, reason: "double-compression artefacts detected" };
  return { flagged: false };
}
// 162. EXIF date-time consistency vs declared issue date
export function exifDateConsistency(m: ImageMetadata, declaredIssueIso?: string): { ok: boolean; reason?: string } {
  if (!m.exifDateTaken || !declaredIssueIso) return { ok: true };
  const taken = Date.parse(m.exifDateTaken); const issued = Date.parse(declaredIssueIso);
  if (!Number.isFinite(taken) || !Number.isFinite(issued)) return { ok: true };
  if (taken < issued - 30 * 86400000) return { ok: false, reason: "photo taken before document issue date" };
  return { ok: true };
}
// 163. Photoshop / GIMP signature
export function editingSoftwareDetected(m: ImageMetadata): { detected: boolean; software?: string } {
  if (m.exifSoftware && FORGERY_SOFTWARE.test(m.exifSoftware)) return { detected: true, software: m.exifSoftware };
  return { detected: false };
}
// 164. Font-family rendering test (placeholder — would compare against issuer template)
export function fontFamilyMismatch(declaredFontHash: string, expectedHashes: string[]): boolean {
  return !expectedHashes.includes(declaredFontHash);
}
// 165. Page-rotation artefacts
export function rotationArtefacts(m: ImageMetadata): boolean {
  return typeof m.rotationDegrees === "number" && m.rotationDegrees !== 0 && m.rotationDegrees !== 90 && m.rotationDegrees !== 180 && m.rotationDegrees !== 270;
}
// 166. Printer anti-counterfeit dot detection
export function antiCounterfeitDots(present: boolean | undefined, expected: boolean): { ok: boolean; reason?: string } {
  if (expected && !present) return { ok: false, reason: "anti-counterfeit dot pattern absent on document where expected" };
  return { ok: true };
}
// 167. Scanner-bed-edge detection
export function scannerEdgeDetected(edgeScore: number | undefined): boolean {
  return typeof edgeScore === "number" && edgeScore > 0.7;
}
// 168. Hologram presence (UV)
export function hologramCheck(uvImagePresent: boolean | undefined, expected: boolean): { ok: boolean; reason?: string } {
  if (expected && !uvImagePresent) return { ok: false, reason: "UV/hologram capture missing for document type that requires it" };
  return { ok: true };
}
// 169. RFID-chip read attempt (e-passport)
export function rfidRead(rfidData: { dgPresent?: boolean; sacChecked?: boolean } | undefined): { ok: boolean; reason?: string } {
  if (!rfidData) return { ok: false, reason: "no RFID read attempt" };
  if (!rfidData.dgPresent) return { ok: false, reason: "RFID DG (data group) not present" };
  if (!rfidData.sacChecked) return { ok: false, reason: "SAC (Supplemental Access Control) not verified" };
  return { ok: true };
}
// 170. Watermark verification
export function watermarkVerify(detectedHash: string, expected: string): { ok: boolean; reason?: string } {
  if (!detectedHash) return { ok: false, reason: "no watermark detected" };
  if (detectedHash !== expected) return { ok: false, reason: "watermark hash mismatch" };
  return { ok: true };
}
