// Hawkeye Sterling — behavioral biometrics (Layers 146-160).

export interface BehavioralEvent {
  type: "keydown" | "keyup" | "mousemove" | "click" | "scroll" | "paste" | "tab" | "touch";
  at: number;          // ms since session start
  key?: string;
  x?: number; y?: number;
  pressure?: number;
  field?: string;
}

// 146. Keystroke biometrics — dwell + flight intervals
export function keystrokeRhythm(events: BehavioralEvent[]): { fingerprint: string; consistency: number } {
  const downs = events.filter((e) => e.type === "keydown");
  const ups = events.filter((e) => e.type === "keyup");
  if (downs.length < 5) return { fingerprint: "", consistency: 0 };
  const dwells: number[] = [];
  for (const d of downs) {
    const u = ups.find((e) => e.key === d.key && e.at > d.at && e.at - d.at < 1000);
    if (u) dwells.push(u.at - d.at);
  }
  if (dwells.length === 0) return { fingerprint: "", consistency: 0 };
  const mean = dwells.reduce((a, b) => a + b, 0) / dwells.length;
  const variance = dwells.reduce((a, b) => a + (b - mean) ** 2, 0) / dwells.length;
  const cv = Math.sqrt(variance) / mean; // lower = more consistent (likely real human)
  const fp = `dwell:${mean.toFixed(0)}ms±${Math.sqrt(variance).toFixed(0)}`;
  return { fingerprint: fp, consistency: Math.max(0, 1 - cv) };
}

// 147. Mouse-movement biometrics — straight lines = bot, curves = human
export function mouseCurvature(events: BehavioralEvent[]): { humanLike: boolean; rationale: string } {
  const moves = events.filter((e) => e.type === "mousemove" && typeof e.x === "number" && typeof e.y === "number");
  if (moves.length < 10) return { humanLike: false, rationale: "insufficient mouse-move samples" };
  let straightSegments = 0;
  for (let i = 2; i < moves.length; i += 1) {
    const dx1 = moves[i - 1]!.x! - moves[i - 2]!.x!;
    const dy1 = moves[i - 1]!.y! - moves[i - 2]!.y!;
    const dx2 = moves[i]!.x! - moves[i - 1]!.x!;
    const dy2 = moves[i]!.y! - moves[i - 1]!.y!;
    const dot = dx1 * dx2 + dy1 * dy2;
    const m1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const m2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    if (m1 > 0 && m2 > 0 && Math.abs(dot / (m1 * m2)) > 0.99) straightSegments += 1;
  }
  const ratio = straightSegments / (moves.length - 2);
  return { humanLike: ratio < 0.5, rationale: `${(ratio * 100).toFixed(0)}% perfectly-straight segments` };
}

// 148. Session-replay anomaly — same event-time vector across sessions
export function sessionReplay(currentSig: string, knownSigs: string[]): boolean {
  return knownSigs.includes(currentSig);
}

// 149. Click-pattern fraud — too-fast clicks
export function clickFraud(events: BehavioralEvent[]): { suspicious: boolean; rationale: string } {
  const clicks = events.filter((e) => e.type === "click").map((e) => e.at);
  if (clicks.length < 3) return { suspicious: false, rationale: "low click count" };
  let rapid = 0;
  for (let i = 1; i < clicks.length; i += 1) if (clicks[i]! - clicks[i - 1]! < 80) rapid += 1;
  return { suspicious: rapid >= 3, rationale: `${rapid} sub-80ms inter-click gaps` };
}

// 150. Time-on-form anomaly
export function timeOnForm(startMs: number, submitMs: number, fields: number): { ok: boolean; rationale: string } {
  const seconds = (submitMs - startMs) / 1000;
  const minExpected = fields * 1.5;          // 1.5s per field minimum
  const maxExpected = fields * 60;           // 60s per field maximum
  if (seconds < minExpected) return { ok: false, rationale: `Form completed in ${seconds.toFixed(0)}s — too fast for ${fields} fields.` };
  if (seconds > maxExpected) return { ok: false, rationale: `Form took ${seconds.toFixed(0)}s — possible help/coaching.` };
  return { ok: true, rationale: `${seconds.toFixed(0)}s — within envelope.` };
}

// 151. Form-field paste detection
export function fieldPasteDetector(events: BehavioralEvent[]): { pastedFields: string[] } {
  const pastes = events.filter((e) => e.type === "paste");
  return { pastedFields: pastes.map((p) => p.field ?? "unknown").filter(Boolean) };
}

// 152. Tab-switching pattern
export function tabSwitching(events: BehavioralEvent[]): { switchCount: number; suspicious: boolean } {
  const tabs = events.filter((e) => e.type === "tab").length;
  return { switchCount: tabs, suspicious: tabs >= 5 };
}

// 153. Scroll-velocity anomaly
export function scrollVelocity(events: BehavioralEvent[]): { suspicious: boolean; rationale: string } {
  const scrolls = events.filter((e) => e.type === "scroll");
  if (scrolls.length < 2) return { suspicious: false, rationale: "insufficient scroll events" };
  const velocities: number[] = [];
  for (let i = 1; i < scrolls.length; i += 1) {
    const dt = scrolls[i]!.at - scrolls[i - 1]!.at;
    const dy = (scrolls[i]!.y ?? 0) - (scrolls[i - 1]!.y ?? 0);
    if (dt > 0) velocities.push(Math.abs(dy / dt));
  }
  const max = Math.max(...velocities);
  return { suspicious: max > 5, rationale: `peak scroll velocity ${max.toFixed(2)}px/ms` };
}

// 154. Touch-pressure biometrics (mobile)
export function touchPressureProfile(events: BehavioralEvent[]): { mean: number; ok: boolean } {
  const ps = events.filter((e) => e.type === "touch" && typeof e.pressure === "number").map((e) => e.pressure!);
  if (ps.length < 3) return { mean: 0, ok: false };
  const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
  return { mean, ok: mean > 0.1 && mean < 0.9 };
}

// 155. Network-latency-pattern fingerprint
export function networkLatencyPattern(rtts: number[]): { fingerprint: string; jitter: number } {
  if (rtts.length === 0) return { fingerprint: "", jitter: 0 };
  const mean = rtts.reduce((a, b) => a + b, 0) / rtts.length;
  const jitter = Math.sqrt(rtts.reduce((a, b) => a + (b - mean) ** 2, 0) / rtts.length);
  return { fingerprint: `rtt:${mean.toFixed(0)}±${jitter.toFixed(0)}`, jitter };
}

// 156. Timezone-offset mismatch
export function timezoneMismatch(browserTzOffsetMin: number, declaredIso2: string): boolean {
  // Crude — lookup table for common jurisdictions
  const expected: Record<string, number[]> = {
    AE: [-240], PK: [-300], IN: [-330], US: [240, 300, 360, 420, 480], GB: [0, -60],
    CN: [-480], RU: [-180, -240, -300, -360, -420, -480, -540], JP: [-540], AU: [-600, -570],
  };
  const e = expected[declaredIso2.toUpperCase()];
  if (!e) return false;
  return !e.includes(browserTzOffsetMin);
}

// 157. Browser-fingerprint stability — flag if changed mid-session
export function browserFingerprintStability(start: string, end: string): boolean {
  return start === end;
}

// 158. Keyboard-language mismatch
export function keyboardLanguageMismatch(kbdLang: string, declaredIso2: string): boolean {
  const expected: Record<string, string[]> = {
    AE: ["ar", "en"], PK: ["en", "ur"], IN: ["en", "hi"], US: ["en"], GB: ["en"],
    CN: ["zh"], RU: ["ru", "en"], DE: ["de"], FR: ["fr"], JP: ["ja"], KR: ["ko"],
  };
  const e = expected[declaredIso2.toUpperCase()];
  if (!e) return false;
  return !e.some((l) => kbdLang.toLowerCase().startsWith(l));
}

// 159. WebRTC IP leak — leaked public IP doesn't match declared
export function webrtcLeak(rtcIp: string, declaredIp: string): boolean {
  return Boolean(rtcIp) && Boolean(declaredIp) && rtcIp !== declaredIp;
}

// 160. Canvas-fingerprint hash collision detection (cluster of accounts)
export function canvasFingerprintCluster(currentHash: string, registry: Map<string, number>): {
  collisionCount: number;
  rationale: string;
} {
  const cnt = registry.get(currentHash) ?? 0;
  return {
    collisionCount: cnt,
    rationale: cnt >= 5
      ? `${cnt} accounts share canvas fingerprint — possible synthetic-identity cluster.`
      : "Within tolerance.",
  };
}
