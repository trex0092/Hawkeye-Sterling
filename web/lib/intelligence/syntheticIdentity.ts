// Hawkeye Sterling — synthetic-identity cluster detector (Layer #45).
//
// Cluster onboardings that share device / IP / pattern indicators —
// classic synthetic-identity fraud / mule-account farming.

export interface IdentityTelemetry {
  subjectId: string;
  /** Device fingerprint (canvas + UA + screen). */
  deviceFingerprint?: string;
  /** Onboarding IP. */
  ip?: string;
  /** Phone number (E.164). */
  phone?: string;
  /** Email address. */
  email?: string;
  /** Onboarding timestamp. */
  at: string;
}

export interface SyntheticCluster {
  signature: string;            // shared identifier
  signatureKind: "device" | "ip" | "phone" | "email" | "email_local_part";
  members: string[];            // subjectIds
  windowSpanH: number;          // span of the cluster in hours
  rationale: string;
}

const VELOCITY_THRESHOLD = 5;

export function detectSyntheticClusters(events: IdentityTelemetry[]): SyntheticCluster[] {
  const clusters: SyntheticCluster[] = [];
  const groupBy = (key: keyof IdentityTelemetry, kind: SyntheticCluster["signatureKind"]): void => {
    const map = new Map<string, IdentityTelemetry[]>();
    for (const e of events) {
      const v = e[key];
      if (!v || typeof v !== "string") continue;
      const arr = map.get(v) ?? [];
      arr.push(e);
      map.set(v, arr);
    }
    for (const [sig, members] of map.entries()) {
      if (members.length < VELOCITY_THRESHOLD) continue;
      const times = members.map((m) => Date.parse(m.at)).sort((a, b) => a - b);
      const spanH = (times[times.length - 1]! - times[0]!) / 3_600_000;
      clusters.push({
        signature: sig,
        signatureKind: kind,
        members: members.map((m) => m.subjectId),
        windowSpanH: Math.round(spanH),
        rationale: `${members.length} onboardings share ${kind} "${sig}" within ${Math.round(spanH)}h — possible synthetic-identity / mule-account farming.`,
      });
    }
  };
  groupBy("deviceFingerprint", "device");
  groupBy("ip", "ip");
  groupBy("phone", "phone");
  // Email local-part — captures variations like alice+1@x.com / alice+2@x.com.
  const localPartMap = new Map<string, IdentityTelemetry[]>();
  for (const e of events) {
    if (!e.email) continue;
    const local = e.email.toLowerCase().split("@")[0]?.replace(/\+.*$/, "");
    const domain = e.email.toLowerCase().split("@")[1];
    if (!local || !domain) continue;
    const k = `${local}@${domain}`;
    const arr = localPartMap.get(k) ?? [];
    arr.push(e);
    localPartMap.set(k, arr);
  }
  for (const [sig, members] of localPartMap.entries()) {
    if (members.length < VELOCITY_THRESHOLD) continue;
    const times = members.map((m) => Date.parse(m.at)).sort((a, b) => a - b);
    const spanH = (times[times.length - 1]! - times[0]!) / 3_600_000;
    clusters.push({
      signature: sig,
      signatureKind: "email_local_part",
      members: members.map((m) => m.subjectId),
      windowSpanH: Math.round(spanH),
      rationale: `${members.length} onboardings share email local-part "${sig}" within ${Math.round(spanH)}h — sub-address / +tag fraud pattern.`,
    });
  }
  return clusters;
}
