# Wave-3 Mode Implementation Spec

**For: implementing the 100+ roadmap mode IDs in `src/brain/reasoning-modes-wave-3.ts` (`WAVE_3_ROADMAP_IDS`)**

The roadmap lists ~118 mode IDs. ~25 are wired (see `WAVE3_MODE_APPLIES` in `registry.ts`). The other ~93 are roadmap-only — they don't run, don't fake findings, just declare intent. To convert one into a real registered mode, supply the spec below and Claude implements it.

## Why a spec is required

Modes produce `Finding` objects that feed the verdict-fusion math (`fusion.ts`) and end up cited in regulator-readable rationale. Inventing thresholds, schemas, or citation anchors produces *plausible-looking* findings that are factually wrong — exactly the failure mode `Charter P9` (no fabrication) forbids. So Claude only writes what you specify.

## Spec template

```yaml
mode_id: <snake_case_id>             # must appear in WAVE_3_ROADMAP_IDS
input:
  evidence_key: <string>             # which key in BrainContext.evidence carries the data
  shape: |
    <TS-style type definition of one input record>
threshold:
  <metric>: <value> -> flag          # what level becomes a 'flag' verdict
  <metric>: <value> -> escalate      # what level becomes 'escalate'
  <metric>: <value> -> block         # (optional) what level becomes 'block'
output:
  verdict_when_clean: clear | inconclusive
  rationale_template: |
    <one or two sentences summarising the finding for the audit chain>
citations:
  - <regulation or framework>
  - <regulation or framework>
faculties:
  - <FacultyId from types.ts FacultyId union>
category: <ReasoningCategory from types.ts ReasoningCategory union>
```

## Worked example — `vessel_ais_gap_analysis`

This was the spec used to ship the existing `vesselAisGapApply` (now aliased to `vessel_ais_gap_analysis` via PR #20):

```yaml
mode_id: vessel_ais_gap_analysis
input:
  evidence_key: vesselAisReports
  shape: |
    interface AisReport {
      timestamp?: string;            # ISO 8601
      imo?: string;
      mmsi?: string;
      lat?: number;
      lon?: number;
      speedKnots?: number;
      reportedDestination?: string;
      flagState?: string;
    }
threshold:
  ais_dark_hours: > 12 -> flag        # >12h gap = dark voyage candidate
  ais_dark_hours: > 24 -> escalate    # >24h + sanctioned-port nexus = STS suspicion
  sanctioned_port_pre_or_post_gap: any -> escalate
  sts_transfer_signature: detected -> escalate
  flag_hopping: > 1 change in 24mo -> flag
output:
  verdict_when_clean: clear
  rationale_template: |
    {n_signals} AIS / vessel signal(s) fired across {n_reports} report(s) for vessel
    {imo}. Dark-period {dark_hours}h. {sts_or_port_note}. Composite {score}.
citations:
  - FATF R.7 (proliferation-related TFS)
  - UN sanctions vessel lists (1267/2231)
  - IMO obligations (transponder operation)
  - UAE FDL 10/2025 Art.15 (sanctions screening)
faculties:
  - data_analysis
  - geopolitical_awareness
category: forensic
```

Apply implementation file: [src/brain/modes/wave3-vessel-ais-gap.ts](src/brain/modes/wave3-vessel-ais-gap.ts)

## How to ask Claude to implement a new mode

Paste a filled-in spec into chat and say "implement this mode." Claude will:

1. Verify the mode_id is in `WAVE_3_ROADMAP_IDS` (or refuse and ask which one to add).
2. Write `src/brain/modes/wave3-<kebab-id>.ts` with one exported `<modeId>Apply: ModeApply`.
3. Register it in `WAVE3_MODE_APPLIES` in `registry.ts`.
4. Add a unit test under `src/brain/modes/__tests__/` that feeds canonical input shapes and asserts the threshold rules fire correctly.
5. Push as a single PR. You run `npm run typecheck && npm run test` locally; merge if green.

## Modes Claude will NOT implement without a spec

If you ask "implement utxo_clustering" without a spec, Claude refuses — the existing implementation already exists, and any new claim would invent its own thresholds. Same applies to all 93 roadmap modes that lack an apply() module today: spec first, code second.
