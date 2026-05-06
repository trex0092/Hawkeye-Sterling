# Hawkeye Sterling — Onboarding / Maintenance Scripts

These scripts are for manual onboarding and maintenance tasks. They are **not** run by CI/CD.

## setup-asana-sections.ps1
**Purpose:** Creates the correct workflow sections in all 9 Asana project boards.  
**When to run:** Initial deployment or when Asana board sections need resetting.  
**Prerequisites:** `$env:ASANA_TOKEN` must be set to your Asana Personal Access Token.  
**Usage:**
```powershell
$env:ASANA_TOKEN = "your_token_here"
.\setup-asana-sections.ps1
```

## rebuild-asana-sections.ps1
**Purpose:** Wipes and recreates all sections in each of the 9 Asana boards in the correct workflow order.  
**WARNING:** This wipes existing sections. Tasks remain in the project but become sectionless.  
**When to run:** Only when board structure is corrupted or needs a full reset.  
**Prerequisites:** `$env:ASANA_TOKEN` must be set.  
**Usage:**
```powershell
$env:ASANA_TOKEN = "your_token_here"
.\rebuild-asana-sections.ps1
```

## smoke-asana.ps1
**Purpose:** Smoke test for Asana integration — verifies connectivity and task creation.  
**When to run:** After environment changes or deployment, to verify Asana integration is healthy.  
**Prerequisites:** `$env:ASANA_TOKEN` must be set.

## Shell equivalents
The bash equivalents (`smoke-asana.sh`) live in `scripts/` at the repo root and can be used on Linux/macOS.

---

*These scripts are documented here per the vendor/script audit policy. Any new scripts added must be documented with: purpose, trigger conditions, prerequisites, and owner.*
