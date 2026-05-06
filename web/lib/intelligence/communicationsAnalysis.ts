// Hawkeye Sterling — communications analysis (Layers 171-180).

// 171. Voice-stress analysis (input is provider score 0..1)
export function voiceStress(score: number | undefined): { stressed: boolean; rationale: string } {
  if (typeof score !== "number") return { stressed: false, rationale: "no voice-stress data" };
  return { stressed: score >= 0.7, rationale: `stress score ${(score * 100).toFixed(0)}%` };
}
// 172. Voice-print verification
export function voicePrintMatch(score: number | undefined, threshold = 0.7): { ok: boolean; reason: string } {
  if (typeof score !== "number") return { ok: false, reason: "no voice-print score" };
  return { ok: score >= threshold, reason: `voice-print ${(score * 100).toFixed(0)}% vs ${(threshold * 100).toFixed(0)}% threshold` };
}
// 173. Email-thread sentiment (basic polarity)
export function emailThreadSentiment(text: string): { polarity: "negative" | "neutral" | "positive"; score: number } {
  const POS = /\b(thank|great|happy|appreciate|pleased)\b/gi;
  const NEG = /\b(angry|complain|unacceptable|threat|sue|fraud|liar|cheat)\b/gi;
  const p = (text.match(POS) ?? []).length;
  const n = (text.match(NEG) ?? []).length;
  const score = (p - n) / Math.max(1, p + n);
  return { polarity: score > 0.3 ? "positive" : score < -0.3 ? "negative" : "neutral", score: Number(score.toFixed(2)) };
}
// 174. Chat-velocity scoring (msgs / min)
export function chatVelocity(messages: Array<{ at: string }>): { velocity: number; suspicious: boolean } {
  if (messages.length < 2) return { velocity: 0, suspicious: false };
  const times = messages.map((m) => Date.parse(m.at)).sort((a, b) => a - b);
  const span = (times[times.length - 1]! - times[0]!) / 60_000;
  const v = messages.length / Math.max(1, span);
  return { velocity: Number(v.toFixed(2)), suspicious: v > 30 };
}
// 175. Voicemail transcription scan for tipping-off vocab
export function voicemailScan(transcription: string): { flagged: boolean; phrases: string[] } {
  const matches: string[] = [];
  const patterns = [/STR\s+(?:has\s+been|was)\s+filed/i, /investigation/i, /your\s+account.{0,30}(suspended|frozen|blocked)/i];
  for (const p of patterns) { const m = transcription.match(p); if (m) matches.push(m[0]); }
  return { flagged: matches.length > 0, phrases: matches };
}
// 176. Customer-letter language consistency (declared vs detected)
export function letterLanguageMatch(detectedLang: string, declaredLang: string): boolean {
  return detectedLang.toLowerCase().startsWith(declaredLang.toLowerCase().slice(0, 2));
}
// 177. Social-media handle screening (against blacklists)
export function socialHandleScreen(handle: string, knownBadList: string[]): { flagged: boolean; reason?: string } {
  const lower = handle.toLowerCase();
  const hit = knownBadList.find((b) => lower.includes(b.toLowerCase()));
  return hit ? { flagged: true, reason: `handle matches known bad list entry "${hit}"` } : { flagged: false };
}
// 178. Telegram / WhatsApp channel scan
export function messengerChannelScan(channelName: string, known: Set<string>): boolean {
  return known.has(channelName.toLowerCase());
}
// 179. Reverse phone-number lookup against fraud databases
export function reversePhoneFraud(phone: string, fraudList: Set<string>): boolean {
  return fraudList.has(phone.replace(/[^0-9+]/g, ""));
}
// 180. Outbound-message templating sanity (no tipping-off via {{templates}})
export function outboundTemplateSanity(template: string): { ok: boolean; reason?: string } {
  if (/\{\{[^}]*(STR|SAR|investigat|frozen|blocked|sanction)/i.test(template))
    return { ok: false, reason: "template variable references compliance-internal vocabulary" };
  return { ok: true };
}
