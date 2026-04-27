#!/usr/bin/env python3
"""Rebuild section workflows on all 17 Hawkeye Sterling Asana boards.

Each board's sections mirror the lifecycle of the app modules that route
into it (see web/app/api/module-report/route.ts for the routing).
Existing sections are deleted first; tasks become section-less inside
the project (they stay in the project — nothing is lost) before being
recreated in the canonical order.

Usage:
    ASANA_TOKEN=<your-pat> python3 scripts/rebuild-asana-sections.py

Optional:
    ASANA_TOKEN=...  ASANA_*_PROJECT_GID=... python3 scripts/rebuild-asana-sections.py
    (any env var of the form ASANA_<SLUG>_PROJECT_GID overrides the
     hardcoded GID for that board)
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://app.asana.com/api/1.0"

# Each tuple: (env-var override, default GID, board label, ordered sections)
BOARDS: list[tuple[str, str, str, list[str]]] = [
    (
        "ASANA_SCREENING_PROJECT_GID",
        "1214148660020527",
        "01 · Screening — Sanctions & Adverse Media",
        [
            "📥 New Screens",
            "🔍 Under Review",
            "⚠️  Hit — Escalated to MLRO",
            "✅ Cleared",
            "🗄️  Closed",
        ],
    ),
    (
        "ASANA_MLRO_DAILY_PROJECT_GID",
        "1214148631086118",
        "02 · Central MLRO Daily Digest",
        [
            "📥 Today's Queue",
            "🔍 In Progress",
            "📋 Pending Sign-off",
            "✅ Completed",
        ],
    ),
    (
        "ASANA_AUDIT_LOG_PROJECT_GID",
        "1214148643197211",
        "03 · Audit Log 10-Year Trail",
        ["📥 New Events", "🔐 Sealed Chain", "📦 Archived (Year-end)"],
    ),
    (
        "ASANA_FOUR_EYES_PROJECT_GID",
        "1214148660376942",
        "04 · Four-Eyes Approvals",
        [
            "📥 Awaiting Reviewer",
            "🔍 Under Review",
            "✅ Approved",
            "↩️  Returned for Revision",
        ],
    ),
    (
        "ASANA_SAR_PROJECT_GID",
        "1214148631336502",
        "05 · STR/SAR/CTR/PMR GoAML Filings",
        [
            "📥 New Reports",
            "✏️  Draft",
            "🔍 MLRO Review",
            "📤 Filed to goAML",
            "✅ Closed",
        ],
    ),
    (
        "ASANA_FFR_PROJECT_GID",
        "1214148643568798",
        "06 · FFR Incidents & Asset Freezes",
        [
            "📥 New Forensic Flags",
            "🔍 Under Investigation",
            "❄️  Freeze Request Sent",
            "✅ Resolved",
            "🗄️  Closed",
        ],
    ),
    (
        "ASANA_KYC_PROJECT_GID",
        "1214148898062562",
        "07 · CDD/SDD/EDD/KYC — Customer Due Diligence",
        [
            "📥 New Onboarding",
            "📄 Pending Documents",
            "🔍 Under Review",
            "✅ Approved",
            "❌ Rejected",
            "🔄 Periodic Re-KYC",
        ],
    ),
    (
        "ASANA_TM_PROJECT_GID",
        "1214148661083263",
        "08 · Transaction Monitoring",
        [
            "📥 New Alerts",
            "🔍 Under Review",
            "⚠️  Escalated to MLRO",
            "📤 SAR Filed",
            "✅ Cleared",
        ],
    ),
    (
        "ASANA_COMPLIANCE_OPS_PROJECT_GID",
        "1214148898610839",
        "09 · Compliance Ops — Daily & Weekly Tasks",
        [
            "📥 New Tasks",
            "🔍 In Progress",
            "⏳ Awaiting Approval",
            "✅ Completed",
        ],
    ),
    (
        "ASANA_SHIPMENTS_PROJECT_GID",
        "1214148898360626",
        "10 · Shipments — Tracking",
        [
            "📥 New Consignments",
            "🔍 AML Screen Required",
            "✈️  In Transit",
            "🏦 At Vault",
            "🚨 Held — Review Required",
            "✅ Cleared & Delivered",
        ],
    ),
    (
        "ASANA_EMPLOYEES_PROJECT_GID",
        "1214148854421310",
        "11 · Employees",
        [
            "📥 New Joiners",
            "📄 Documents Pending",
            "⏰ Expiring Soon",
            "✅ Compliant",
            "🚪 Offboarded",
        ],
    ),
    (
        "ASANA_TRAINING_PROJECT_GID",
        "1214148854927671",
        "12 · Training",
        [
            "📥 Assigned",
            "📚 In Progress",
            "✅ Completed",
            "⏰ Recertification Due",
        ],
    ),
    (
        "ASANA_GOVERNANCE_PROJECT_GID",
        "1214148855187093",
        "13 · Compliance Governance",
        [
            "📥 New Items",
            "🔍 Under Review",
            "📋 Awaiting Board Sign-off",
            "✅ Approved",
            "🗄️  Archived",
        ],
    ),
    (
        "ASANA_ROUTINES_PROJECT_GID",
        "1214148910147230",
        "14 · Routines — Scheduled",
        [
            "⏰ Scheduled",
            "🔄 Running",
            "✅ Completed",
            "❌ Failed — Retry",
        ],
    ),
    (
        "ASANA_MLRO_PROJECT_GID",
        "1214148910059926",
        "15 · MLRO Workbench",
        [
            "📥 New Tasks",
            "🔍 In Progress",
            "⏳ Pending Decision",
            "✅ Decided",
            "🔄 Returned for Revision",
        ],
    ),
    (
        "ASANA_SUPPLYCHAIN_PROJECT_GID",
        "1214148855758874",
        "16 · Supply Chain, ESG & LBMA Gold",
        [
            "📥 New Checks",
            "🔍 Under Review",
            "🚨 Sanctions Hit",
            "✅ Cleared",
        ],
    ),
    (
        "ASANA_EXPORT_CTRL_PROJECT_GID",
        "1214148895117190",
        "17 · Export Control & Dual-Use",
        [
            "📥 New Declarations",
            "🔍 Under Review",
            "⚠️  Dual-Use Flagged",
            "✅ Cleared",
        ],
    ),
]


def request(method: str, path: str, token: str, body: dict | None = None) -> dict:
    url = f"{API}{path}"
    payload = json.dumps({"data": body}).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=payload,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
            if not raw:
                return {}
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} → {e.code}: {body_text}") from e


def main() -> int:
    token = os.environ.get("ASANA_TOKEN")
    if not token:
        print("ASANA_TOKEN env var is required.", file=sys.stderr)
        return 1

    me = request("GET", "/users/me", token).get("data", {})
    if not me.get("name"):
        print("Token rejected by Asana.", file=sys.stderr)
        return 1
    print(f"Authenticated as: {me.get('name')} <{me.get('email')}>\n")
    print("─" * 72)

    rebuilt = 0
    for env_var, default_gid, label, sections in BOARDS:
        gid = os.environ.get(env_var) or default_gid
        print(f"\n  {label}")
        print(f"    gid: {gid}")

        try:
            existing = request("GET", f"/projects/{gid}/sections", token).get(
                "data", []
            )
        except RuntimeError as e:
            print(f"    ✗ cannot fetch sections — {e}", file=sys.stderr)
            continue

        for sec in existing:
            try:
                request("DELETE", f"/sections/{sec['gid']}", token)
            except RuntimeError as e:
                print(f"    ! delete {sec['name']!r} failed: {e}", file=sys.stderr)
            time.sleep(0.1)

        time.sleep(0.4)

        created = 0
        for name in sections:
            try:
                request(
                    "POST", f"/projects/{gid}/sections", token, {"name": name}
                )
                created += 1
            except RuntimeError as e:
                print(f"    ! create {name!r} failed: {e}", file=sys.stderr)
            time.sleep(0.15)

        print(
            f"    ✓ deleted {len(existing)} · created {created}/{len(sections)} sections"
        )
        rebuilt += 1

    print("\n" + "─" * 72)
    print(f"Done. Rebuilt {rebuilt}/{len(BOARDS)} boards.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
