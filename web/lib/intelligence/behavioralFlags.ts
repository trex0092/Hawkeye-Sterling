// Hawkeye Sterling — behavioral red-flag detector.
//
// Pure-function detector for FATF / UAE behavioral red flags. Catches the
// patterns that the linear composite-score path can miss: shell-company
// indicators, document-tampering signals, identity-velocity flags,
// nominee-ownership signals, and rapid-onboarding patterns.
//
// Inputs come from the KYC onboarding form, document metadata, and the
// IP / device / session telemetry the screening route collects.

export type BehavioralFlagId =
  // Shell / nominee
  | "no_operating_substance"
  | "common_address_with_known_shell"
  | "common_director_with_known_shell"
  | "nominee_director_pattern"
  | "incorporated_within_30d"
  | "single_shareholder_natural_person_offshore"
  // Document / identity
  | "id_doc_metadata_inconsistency"
  | "id_doc_resolution_too_low"
  | "id_doc_template_mismatch"
  | "selfie_liveness_failed"
  | "selfie_face_mismatch"
  | "passport_mrz_checksum_invalid"
  // Velocity / pattern
  | "rapid_onboarding_velocity"
  | "ip_jurisdiction_mismatch"
  | "vpn_or_tor_detected"
  | "device_fingerprint_collision"
  | "session_replayed"
  // Sanctions evasion
  | "name_orthography_variant_of_designated"
  | "alias_overlaps_designated"
  | "address_in_comprehensive_sanctions_zone"
  | "vessel_imo_relisted_after_designation"
  | "ais_gap_in_high_risk_corridor"
  // Trade-finance
  | "invoice_round_number_pattern"
  | "invoice_above_market_price"
  | "invoice_below_market_price"
  | "phantom_shipment_no_ais_trace"
  | "third_party_payment"
  // PEP
  | "pep_recent_office_exit"
  | "pep_family_business_overlap"
  | "pep_disproportionate_wealth";

export interface BehavioralFlag {
  id: BehavioralFlagId;
  label: string;
  severity: "critical" | "high" | "medium" | "low";
  detail: string;
  /** Where this flag was sourced (which input field / module fired it). */
  source: string;
}

export interface BehavioralInputs {
  // Shell / corporate
  /** Number of declared employees (0 / null = signal). */
  employeeCount?: number | null;
  /** Has a public website. */
  hasWebsite?: boolean;
  /** Days since incorporation. */
  daysSinceIncorporation?: number | null;
  /** Registered address shared with N other entities — n+1 with same address signals registered-agent shell. */
  sharedAddressCount?: number | null;
  /** Director(s) flagged as nominee/proxy. */
  nomineeDirectorFlag?: boolean;
  /** Single-shareholder natural person resident in offshore jurisdiction. */
  singleShareholderOffshore?: boolean;
  /** Director also serves on N other boards (>10 → red flag). */
  directorBoardCount?: number | null;
  /** Subject's registered address ISO2. */
  registeredAddressIso2?: string | null;

  // Document / identity
  /** ID doc metadata mismatch (creation date vs. capture date, EXIF flags). */
  idDocMetadataInconsistent?: boolean;
  /** ID doc image resolution below 1MP. */
  idDocLowResolution?: boolean;
  /** ID doc template doesn't match issuing-country baseline. */
  idDocTemplateMismatch?: boolean;
  /** Liveness check failed. */
  selfieLivenessFailed?: boolean;
  /** Face-match between selfie and ID below threshold. */
  selfieFaceMatchScore?: number | null;
  /** Passport MRZ checksum invalid. */
  passportMrzInvalid?: boolean;

  // Velocity / device
  /** N onboardings from same IP in last 24h (≥5 → red flag). */
  onboardingsFromIp24h?: number | null;
  /** IP geolocation ISO2 vs. declared jurisdiction. */
  ipIso2?: string | null;
  declaredIso2?: string | null;
  /** VPN / Tor / proxy detected. */
  vpnOrTorDetected?: boolean;
  /** Device fingerprint matches another customer. */
  deviceFingerprintCollision?: boolean;
  /** Session token reuse detected. */
  sessionReplayed?: boolean;

  // Sanctions evasion
  /** Subject name is an orthography variant of a sanctioned name. */
  nameVariantOfDesignated?: boolean;
  /** One or more aliases match sanctioned subjects. */
  aliasOverlapsDesignated?: boolean;
  /** Vessel IMO appears on dark-fleet / re-listed registry. */
  vesselImoRelisted?: boolean;
  /** AIS gap > 24h in a high-risk corridor (Red Sea / Black Sea / Persian Gulf). */
  aisGapHighRiskCorridor?: boolean;

  // Trade
  /** Invoice values cluster on round numbers (>50% end in 000). */
  invoiceRoundNumberCluster?: boolean;
  /** Invoiced unit price >25% above market reference. */
  invoiceAboveMarket?: boolean;
  /** Invoiced unit price >25% below market reference. */
  invoiceBelowMarket?: boolean;
  /** Goods purportedly shipped but no AIS / customs trace. */
  phantomShipment?: boolean;
  /** Payment from a party not on the contract. */
  thirdPartyPayment?: boolean;

  // PEP
  /** PEP left office within last 12 months. */
  pepRecentExit?: boolean;
  /** PEP / spouse / child has business with subject's group. */
  pepFamilyBusinessOverlap?: boolean;
  /** Wealth materially exceeds documented income. */
  pepDisproportionateWealth?: boolean;
}

const COMPREHENSIVE_SANCTION_ISO2 = new Set(["IR", "KP", "SY", "CU"]);

export function detectBehavioralFlags(input: BehavioralInputs): BehavioralFlag[] {
  const flags: BehavioralFlag[] = [];

  // ── Shell / nominee ────────────────────────────────────────────────────
  if (input.employeeCount === 0 && input.hasWebsite === false) {
    flags.push({
      id: "no_operating_substance",
      label: "No operating substance",
      severity: "high",
      detail: "Zero declared employees and no public website — shell-company indicator.",
      source: "kyc.employeeCount + kyc.hasWebsite",
    });
  }
  if ((input.sharedAddressCount ?? 0) >= 25) {
    flags.push({
      id: "common_address_with_known_shell",
      label: "Registered address shared with 25+ entities",
      severity: "high",
      detail: `Address shared with ${input.sharedAddressCount} other entities — registered-agent / nominee structure.`,
      source: "kyc.registeredAddress",
    });
  }
  if ((input.directorBoardCount ?? 0) >= 10) {
    flags.push({
      id: "common_director_with_known_shell",
      label: "Director on 10+ boards",
      severity: "medium",
      detail: `Director sits on ${input.directorBoardCount} boards — nominee / professional-director pattern.`,
      source: "kyc.directorBoardCount",
    });
  }
  if (input.nomineeDirectorFlag) {
    flags.push({
      id: "nominee_director_pattern",
      label: "Nominee director identified",
      severity: "high",
      detail: "One or more directors are flagged as nominee / proxy — UBO obscurity.",
      source: "kyc.directors",
    });
  }
  if ((input.daysSinceIncorporation ?? 365) <= 30) {
    flags.push({
      id: "incorporated_within_30d",
      label: "Incorporated within 30 days",
      severity: "medium",
      detail: "Newly-formed legal entity — no operating history; verify commercial purpose.",
      source: "kyc.daysSinceIncorporation",
    });
  }
  if (input.singleShareholderOffshore) {
    flags.push({
      id: "single_shareholder_natural_person_offshore",
      label: "Single shareholder in offshore jurisdiction",
      severity: "high",
      detail: "Single natural-person shareholder resident in an offshore secrecy jurisdiction — UBO opacity.",
      source: "kyc.shareholders",
    });
  }

  // ── Document / identity ────────────────────────────────────────────────
  if (input.idDocMetadataInconsistent) {
    flags.push({
      id: "id_doc_metadata_inconsistency",
      label: "ID document metadata inconsistency",
      severity: "high",
      detail: "EXIF / capture metadata inconsistent with document issue date — possible tampering.",
      source: "kyc.idDocMetadata",
    });
  }
  if (input.idDocLowResolution) {
    flags.push({
      id: "id_doc_resolution_too_low",
      label: "ID document resolution below threshold",
      severity: "medium",
      detail: "Image resolution below 1MP — re-capture before disposition.",
      source: "kyc.idDoc",
    });
  }
  if (input.idDocTemplateMismatch) {
    flags.push({
      id: "id_doc_template_mismatch",
      label: "ID document template mismatch",
      severity: "high",
      detail: "Document layout doesn't match the issuing country's reference template — possible forgery.",
      source: "kyc.idDocTemplate",
    });
  }
  if (input.selfieLivenessFailed) {
    flags.push({
      id: "selfie_liveness_failed",
      label: "Selfie liveness check failed",
      severity: "high",
      detail: "Liveness probe failed — possible synthetic identity / deepfake.",
      source: "kyc.selfie",
    });
  }
  if (typeof input.selfieFaceMatchScore === "number" && input.selfieFaceMatchScore < 0.7) {
    flags.push({
      id: "selfie_face_mismatch",
      label: "Face match below threshold",
      severity: "high",
      detail: `Face-match score ${(input.selfieFaceMatchScore * 100).toFixed(0)}% — below the 70% acceptance threshold.`,
      source: "kyc.selfie",
    });
  }
  if (input.passportMrzInvalid) {
    flags.push({
      id: "passport_mrz_checksum_invalid",
      label: "Passport MRZ checksum invalid",
      severity: "critical",
      detail: "Machine-readable zone checksum doesn't validate — passport is forged or misread.",
      source: "kyc.passport",
    });
  }

  // ── Velocity / device ─────────────────────────────────────────────────
  if ((input.onboardingsFromIp24h ?? 0) >= 5) {
    flags.push({
      id: "rapid_onboarding_velocity",
      label: "Rapid onboarding velocity",
      severity: "high",
      detail: `${input.onboardingsFromIp24h} onboardings from this IP in the last 24h — synthetic-identity farming pattern.`,
      source: "telemetry.ip24h",
    });
  }
  if (input.ipIso2 && input.declaredIso2 && input.ipIso2 !== input.declaredIso2) {
    flags.push({
      id: "ip_jurisdiction_mismatch",
      label: "IP jurisdiction mismatch",
      severity: "medium",
      detail: `IP geolocates to ${input.ipIso2}, declared jurisdiction is ${input.declaredIso2}.`,
      source: "telemetry.geoip",
    });
  }
  if (input.vpnOrTorDetected) {
    flags.push({
      id: "vpn_or_tor_detected",
      label: "VPN / Tor / proxy detected",
      severity: "medium",
      detail: "Anonymising network in use during onboarding.",
      source: "telemetry.vpn",
    });
  }
  if (input.deviceFingerprintCollision) {
    flags.push({
      id: "device_fingerprint_collision",
      label: "Device fingerprint collision",
      severity: "high",
      detail: "Device fingerprint matches another active customer — possible duplicate-account / mule-account pattern.",
      source: "telemetry.device",
    });
  }
  if (input.sessionReplayed) {
    flags.push({
      id: "session_replayed",
      label: "Session token reuse",
      severity: "high",
      detail: "Onboarding session token was reused — signals account-takeover or scripted attack.",
      source: "telemetry.session",
    });
  }

  // ── Sanctions evasion ──────────────────────────────────────────────────
  if (input.nameVariantOfDesignated) {
    flags.push({
      id: "name_orthography_variant_of_designated",
      label: "Name is orthography variant of designated party",
      severity: "high",
      detail: "Subject name resolves to a phonetic / transliteration variant of a sanctioned subject — disambiguate before clearing.",
      source: "screening.matching",
    });
  }
  if (input.aliasOverlapsDesignated) {
    flags.push({
      id: "alias_overlaps_designated",
      label: "Alias overlaps designated subject",
      severity: "high",
      detail: "One or more declared aliases match a sanctioned subject — high-priority disambiguation required.",
      source: "screening.aliases",
    });
  }
  if (input.registeredAddressIso2 && COMPREHENSIVE_SANCTION_ISO2.has(input.registeredAddressIso2.toUpperCase())) {
    flags.push({
      id: "address_in_comprehensive_sanctions_zone",
      label: "Address in comprehensive-sanctions jurisdiction",
      severity: "critical",
      detail: `Registered address in ${input.registeredAddressIso2} — comprehensive sanctions regime.`,
      source: "kyc.address",
    });
  }
  if (input.vesselImoRelisted) {
    flags.push({
      id: "vessel_imo_relisted_after_designation",
      label: "Vessel IMO re-listed after designation",
      severity: "high",
      detail: "IMO appears on the dark-fleet / re-flagged register — common sanctions-evasion pattern.",
      source: "vessel.imo",
    });
  }
  if (input.aisGapHighRiskCorridor) {
    flags.push({
      id: "ais_gap_in_high_risk_corridor",
      label: "AIS gap in high-risk corridor",
      severity: "high",
      detail: "Vessel AIS transmission gap >24h in a high-risk corridor — possible sanctions evasion via dark-fleet ship-to-ship transfer.",
      source: "vessel.ais",
    });
  }

  // ── Trade-finance ─────────────────────────────────────────────────────
  if (input.invoiceRoundNumberCluster) {
    flags.push({
      id: "invoice_round_number_pattern",
      label: "Round-number invoice pattern",
      severity: "medium",
      detail: "Invoice values cluster on round numbers — common TBML / structuring indicator.",
      source: "trade.invoices",
    });
  }
  if (input.invoiceAboveMarket) {
    flags.push({
      id: "invoice_above_market_price",
      label: "Invoice >25% above market price",
      severity: "high",
      detail: "Unit prices materially exceed market reference — over-invoicing TBML pattern.",
      source: "trade.priceCheck",
    });
  }
  if (input.invoiceBelowMarket) {
    flags.push({
      id: "invoice_below_market_price",
      label: "Invoice >25% below market price",
      severity: "high",
      detail: "Unit prices materially below market — under-invoicing TBML pattern.",
      source: "trade.priceCheck",
    });
  }
  if (input.phantomShipment) {
    flags.push({
      id: "phantom_shipment_no_ais_trace",
      label: "Phantom shipment — no AIS / customs trace",
      severity: "critical",
      detail: "Goods purportedly shipped but no AIS or customs record — phantom-shipment TBML.",
      source: "trade.shipping",
    });
  }
  if (input.thirdPartyPayment) {
    flags.push({
      id: "third_party_payment",
      label: "Third-party payment",
      severity: "medium",
      detail: "Payment received from a party not on the underlying contract — layering indicator.",
      source: "trade.payments",
    });
  }

  // ── PEP ───────────────────────────────────────────────────────────────
  if (input.pepRecentExit) {
    flags.push({
      id: "pep_recent_office_exit",
      label: "PEP exited office within 12 months",
      severity: "medium",
      detail: "FATF R.12 still applies to former PEPs — particularly within the cool-off period.",
      source: "screening.pep",
    });
  }
  if (input.pepFamilyBusinessOverlap) {
    flags.push({
      id: "pep_family_business_overlap",
      label: "PEP family business overlap",
      severity: "high",
      detail: "PEP / spouse / child has business with the subject's group — RCA contagion.",
      source: "screening.rca",
    });
  }
  if (input.pepDisproportionateWealth) {
    flags.push({
      id: "pep_disproportionate_wealth",
      label: "Wealth materially exceeds documented income",
      severity: "high",
      detail: "PEP's wealth materially exceeds documented income from public service + private business — kleptocracy indicator.",
      source: "screening.sow",
    });
  }

  return flags;
}
