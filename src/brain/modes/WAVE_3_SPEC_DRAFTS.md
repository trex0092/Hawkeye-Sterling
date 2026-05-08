# Wave-3 Mode Spec Drafts — 8 modes from public UAE/FATF regulations

**Status:** DRAFT — review thresholds + citations, then approve. Lines marked
`⚠️ VERIFY` need MLRO sign-off because the regulation gives a range or
multiple options.

After approval, each spec gets implemented as a `wave3-<kebab-id>.ts` file
+ registered in `WAVE3_MODE_APPLIES` in `registry.ts` + a vitest test.

---

## 1. `re_cash_purchase_check` — Real-estate cash purchase trigger

```yaml
mode_id: re_cash_purchase_check
input:
  evidence_key: realEstateTransactions
  shape: |
    interface RealEstateTxn {
      txnId: string;
      buyerId: string;
      propertyValueAed: number;
      cashComponentAed: number;     # cash portion of payment
      financingComponentAed: number; # bank-financed portion
      jurisdiction: string;          # ISO-2
      at: string;                    # ISO datetime
      isOffPlan?: boolean;
    }
threshold:
  cashComponentAed: >= 55_000 -> flag    # CR134/2025 Art.3 — DPMS-equivalent threshold for RE
  cashComponentAed: >= 100_000 -> escalate # ⚠️ VERIFY (interpolated; UAE has no explicit RE-cash rule above DPMS)
  cash_pct_of_value: >= 0.5 -> flag      # >50% cash on a property = high anomaly
  cash_pct_of_value: >= 0.8 -> escalate  # >80% cash = source-of-funds investigation required
output:
  verdict_when_clean: clear
  rationale_template: |
    {n_signals} cash-purchase signal(s) on property worth AED {value}.
    Cash component AED {cash} ({cash_pct}% of total). {jurisdiction_note}.
citations:
  - UAE Federal Decree-Law 10/2025 Art.18 (DNFBP CDD obligations for real-estate brokers)
  - UAE Cabinet Resolution 134/2025 Art.3 (AED 55,000 cash threshold — applied by analogy)
  - FATF R.22 (DNFBPs incl. real-estate agents)
  - FATF R.10 (CDD)
faculties:
  - data_analysis
  - forensic_accounting
category: compliance_framework
```

---

## 2. `npo_grantee_diligence` — NPO grant-recipient due-diligence gap

```yaml
mode_id: npo_grantee_diligence
input:
  evidence_key: npoGrants
  shape: |
    interface NpoGrant {
      grantId: string;
      npoId: string;
      granteeName: string;
      granteeJurisdiction: string;        # ISO-2
      amountAed: number;
      purpose: string;
      cddCompleted: boolean;              # was grantee CDD performed?
      cddDocsRetained: boolean;
      isCahraJurisdiction: boolean;       # conflict-affected / high-risk area
      isCashDistribution: boolean;
      at: string;
    }
threshold:
  cddCompleted == false: any -> flag           # FATF R.8 minimum
  cddDocsRetained == false: any -> flag        # CD 50/2018 Art.4 retention requirement
  isCahraJurisdiction && !cddCompleted: any -> escalate
  isCashDistribution && amountAed > 5_000: any -> flag    # ⚠️ VERIFY threshold
  amountAed > 100_000 && !cddCompleted: any -> escalate
output:
  verdict_when_clean: clear
  rationale_template: |
    {n_grants} grant(s) reviewed. {missing_cdd_count} lack grantee CDD.
    {cahra_count} to CAHRA jurisdictions. {cash_count} cash distributions.
citations:
  - FATF R.8 (Non-profit organisations)
  - UAE Cabinet Decision 50/2018 (regulating NPO sector for AML/CFT)
  - UAE Federal Decree-Law 20/2018 Art.15 (NPO supervision)
faculties:
  - compliance_framework
  - data_analysis
category: compliance_framework
```

---

## 3. `lc_confirmation_gap` — Letter of Credit confirmation absence on high-risk LCs

```yaml
mode_id: lc_confirmation_gap
input:
  evidence_key: letterOfCreditTransactions
  shape: |
    interface LcTransaction {
      lcId: string;
      issuingBank: string;            # SWIFT BIC of issuer
      issuingBankCountry: string;     # ISO-2
      advisingBank?: string;
      confirmingBank?: string;        # null = unconfirmed
      beneficiaryCountry: string;     # ISO-2
      goods: string;
      amountUsd: number;
      uCpVersion?: 'UCP600' | 'UCP500' | 'other';
      at: string;
    }
threshold:
  amountUsd > 1_000_000 && !confirmingBank: any -> flag
  amountUsd > 5_000_000 && !confirmingBank: any -> escalate    # ⚠️ VERIFY institution risk appetite
  issuingBankCountry in [HIGH_RISK_LIST] && !confirmingBank: any -> escalate
  uCpVersion != 'UCP600': any -> flag                          # Pre-UCP600 LCs are obsolete
output:
  verdict_when_clean: clear
  rationale_template: |
    {n_lcs} LC(s) reviewed. {unconfirmed_count} unconfirmed; {high_value_unconfirmed} > $1M.
    {high_risk_country_count} from FATF high-risk countries.
citations:
  - FATF R.16 (Wire transfers / LC chains)
  - FATF Recommendation 15 (New technologies / trade finance)
  - ICC UCP 600 — confirming bank obligations
  - Wolfsberg Trade Finance Principles 2019
faculties:
  - data_analysis
  - forensic_accounting
category: forensic
```

---

## 4. `flag_of_convenience` — Vessel registered under Flag of Convenience

```yaml
mode_id: flag_of_convenience
input:
  evidence_key: vesselRegistrations
  shape: |
    interface VesselRegistration {
      imo: string;
      currentFlag: string;              # ISO-2 of registry
      currentFlagSince: string;         # ISO date of last reflagging
      flagHistory: Array<{ flag: string; from: string; to: string }>;
      vesselType: string;               # tanker, bulker, container, etc.
      ownerJurisdiction?: string;       # ISO-2 of registered owner
      operatorJurisdiction?: string;    # ISO-2 of commercial operator
    }
threshold:
  currentFlag in FOC_LIST: any -> flag                    # ITF Flag of Convenience list
  flag_changes_in_24mo >= 2: any -> flag                  # frequent reflagging
  flag_changes_in_24mo >= 3: any -> escalate
  ownerJurisdiction != currentFlag && operatorJurisdiction != currentFlag: any -> flag  # owner/operator/flag mismatch
output:
  verdict_when_clean: clear
  rationale_template: |
    Vessel IMO {imo} registered under {currentFlag} ({foc_status}).
    {flag_change_count} flag changes in past 24 months.
    Owner: {ownerJurisdiction}, Operator: {operatorJurisdiction}.
citations:
  - FATF Vessel-Risk Indicators (Sept 2020 update)
  - International Transport Workers' Federation (ITF) FoC list
  - IMO Resolution A.1117(30) — Implementation of IMO instruments
  - UN Security Council Resolution 2375 (2017) re North Korea-flagged vessels
faculties:
  - data_analysis
  - geopolitical_awareness
category: forensic
constants:
  FOC_LIST:
    # ITF FoC list as of 2024 — verify annually:
    - PA   # Panama
    - LR   # Liberia
    - MH   # Marshall Islands
    - VC   # St Vincent & Grenadines
    - CY   # Cyprus
    - MT   # Malta
    - AG   # Antigua & Barbuda
    - BS   # Bahamas
    - BM   # Bermuda
    - KH   # Cambodia
    - KY   # Cayman Islands
    - KM   # Comoros
    - GQ   # Equatorial Guinea
    - FR_TF # French International Ship Register
    - DE_GIS # German International Ship Register
    - GE   # Georgia
    - GI   # Gibraltar
    - HN   # Honduras
    - LB   # Lebanon
    - MV   # Maldives
    - MU   # Mauritius
    - MD   # Moldova
    - MN   # Mongolia
    - MM   # Myanmar
    - KP   # North Korea (also fully sanctioned)
    - VU   # Vanuatu
    - SL   # Sierra Leone
    - LK   # Sri Lanka
    - TO   # Tonga
```

---

## 5. `port_state_control` — Port-State-Control detention / inspection deficiency

```yaml
mode_id: port_state_control
input:
  evidence_key: pscRecords
  shape: |
    interface PscRecord {
      imo: string;
      inspectionDate: string;       # ISO date
      portCountry: string;          # ISO-2
      mou: 'paris' | 'tokyo' | 'caribbean' | 'mediterranean' | 'us_uscg' | 'other';
      detentions: number;           # count of detentions in this inspection
      deficiencies: number;         # total deficiencies recorded
      deficiencyCategories: string[]; # eg. 'safety', 'pollution', 'crew_certification'
    }
threshold:
  detentions >= 1: any -> flag                              # any detention is significant
  detentions_in_24mo >= 2: any -> escalate                  # repeat detentions
  deficiencies >= 10: any -> flag
  mou in ['paris', 'tokyo'] && detentions >= 1: any -> escalate    # ⚠️ VERIFY (Tier-1 MoU detentions)
output:
  verdict_when_clean: clear
  rationale_template: |
    PSC record for IMO {imo}: {detentions_total} detentions across
    {inspection_count} inspections in 24 months. Deficiencies: {def_total}.
    Last detention: {last_detention_port} ({last_detention_date}).
citations:
  - Paris MoU on Port State Control (2021 White-Grey-Black list)
  - Tokyo MoU on Port State Control
  - IMO Resolution A.1138(31) — Procedures for Port State Control
  - FATF Vessel-Risk Indicators (Sept 2020)
faculties:
  - data_analysis
  - forensic_accounting
category: forensic
```

---

## 6. `oecd_annex_ii_discipline` — OECD DDG Annex II red-flag check (gold)

```yaml
mode_id: oecd_annex_ii_discipline
input:
  evidence_key: goldSupplyChain
  shape: |
    interface GoldShipment {
      shipmentId: string;
      originCountry: string;            # ISO-2
      transitCountries: string[];       # ISO-2 list
      refinery: string;
      refineryRmapStatus: 'conformant' | 'active' | 'expired' | 'not_enrolled';
      smelterId?: string;
      isCahraOrigin: boolean;           # Conflict-Affected & High-Risk Area
      hasArtisanalOrigin?: boolean;
      hasMilitaryControl?: boolean;     # mine/refinery under non-state armed group
      yearOfShipment: string;
    }
threshold:
  isCahraOrigin && refineryRmapStatus == 'not_enrolled': any -> escalate
  isCahraOrigin && refineryRmapStatus == 'expired': any -> flag
  hasArtisanalOrigin && !isCahraOrigin: any -> flag         # Annex II §1.a — artisanal sourcing
  hasMilitaryControl: any -> block                          # Annex II §1.b — non-state armed groups
  transitCountries.includes(SANCTIONED_COUNTRY): any -> escalate
output:
  verdict_when_clean: clear
  rationale_template: |
    Gold shipment {id} from {origin} via {transit}. Refinery: {refinery}
    ({rmap_status}). CAHRA origin: {cahra}. Artisanal: {artisanal}.
    Military control: {military}. {n_red_flags} Annex II red-flag(s) fired.
citations:
  - OECD Due Diligence Guidance for Responsible Supply Chains of Minerals from Conflict-Affected and High-Risk Areas (2016, Gold Supplement)
  - OECD DDG Annex II — Specific red-flag locations and circumstances
  - LBMA Responsible Gold Guidance v9
  - UAE MoE Circular 2/2024 (responsible-sourcing for precious metals)
  - UN Security Council Resolution 1857 (DRC sanctions, gold-trade nexus)
faculties:
  - compliance_framework
  - geopolitical_awareness
category: compliance_framework
```

---

## 7. `lbma_five_step_gate` — LBMA Responsible Gold Guidance 5-step compliance gate

```yaml
mode_id: lbma_five_step_gate
input:
  evidence_key: lbmaCompliance
  shape: |
    interface LbmaComplianceRecord {
      refinerId: string;
      reportingYear: string;
      step1_managementSystems: { complete: boolean; lastUpdated: string };
      step2_riskIdentification: { complete: boolean; cahraIdentified: boolean };
      step3_riskMitigation: { complete: boolean; suspendedSuppliers: number };
      step4_independentAudit: { complete: boolean; auditorName?: string; auditDate?: string; outcome?: 'conformant' | 'major_findings' | 'minor_findings' };
      step5_publicReport: { complete: boolean; publicUrl?: string; publishedAt?: string };
    }
threshold:
  step1.complete == false: any -> flag
  step2.complete == false: any -> flag
  step3.complete == false: any -> flag
  step4.complete == false: any -> escalate              # external audit is non-negotiable
  step5.complete == false: any -> flag
  step4.outcome == 'major_findings': any -> escalate
  steps_complete < 3: any -> escalate                   # majority-incomplete
  steps_complete < 5 && reportingYear == THIS_YEAR: any -> flag   # year-end gap
output:
  verdict_when_clean: clear
  rationale_template: |
    Refiner {refinerId} reporting year {year}: {complete_count}/5 steps
    complete. Step-by-step status: {step_summary}. Audit: {audit_status}.
citations:
  - LBMA Responsible Gold Guidance v9 (effective 1 January 2022)
  - LBMA Good Delivery Rules — annual audit requirement
  - OECD Due Diligence Guidance — 5-step framework
  - UAE MoE Circular 2/2024 — LBMA-aligned obligations for UAE refiners
faculties:
  - compliance_framework
  - data_analysis
category: compliance_framework
```

---

## 8. `cargo_manifest_cross_check` — Cargo manifest vs LC/invoice consistency

```yaml
mode_id: cargo_manifest_cross_check
input:
  evidence_key: cargoManifests
  shape: |
    interface CargoManifest {
      manifestId: string;
      vessel: string;
      blNumber: string;                   # bill of lading
      portLoading: string;
      portDischarge: string;
      goodsDescription: string;
      hsCode: string;
      declaredWeightKg: number;
      declaredValueUsd: number;
      lcReference?: string;               # links to LC
      invoiceReference?: string;
      at: string;
    }
    # Plus a parallel `invoices` evidence key with shape:
    interface Invoice {
      invoiceId: string;
      blReference: string;                # links back to manifest by bl
      goodsDescription: string;
      hsCode: string;
      weightKg: number;
      valueUsd: number;
      shipperCountry: string;
      consigneeCountry: string;
    }
threshold:
  hsCode_mismatch_manifest_vs_invoice: any -> flag
  weight_diff_pct > 10: any -> flag
  weight_diff_pct > 25: any -> escalate
  value_diff_pct > 15: any -> flag                    # ⚠️ VERIFY — 10% is FATF guidance, 15% institution-risk-tier
  value_diff_pct > 50: any -> escalate                # over/under-invoicing (TBML)
  no_invoice_for_manifest: any -> flag
output:
  verdict_when_clean: clear
  rationale_template: |
    {n_manifests} manifest(s) cross-checked against {n_invoices} invoice(s).
    {mismatch_count} discrepancies: {hs_mismatch} HS-code, {weight_mismatch}
    weight, {value_mismatch} value. {orphan_count} manifests without invoices.
citations:
  - FATF Trade-Based Money Laundering Risk Indicators (2021)
  - FATF R.16 (wire transfer / trade finance traceability)
  - World Customs Organization (WCO) Trade-Based Money Laundering guide
  - UAE Federal Customs Authority — manifest-validation requirements
  - Egmont Group TBML Typologies 2020
faculties:
  - forensic_accounting
  - data_analysis
category: forensic
```

---

## How to approve

Reply with:
- `"approve all 8"` → I implement all 8 as wave-3 modes + tests
- `"approve 1, 3, 5"` → I implement only those
- `"reject thresholds in mode N — set X to Y"` → I revise + re-submit
- `"reject mode N entirely"` → drop from the batch

Lines marked `⚠️ VERIFY` are best-guess interpretations — I'll use them
unless you override.
