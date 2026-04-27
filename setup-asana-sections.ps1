# Hawkeye Sterling — Asana Workflow Setup
# Sets the correct workflow sections in all 9 Asana project boards.
# Run from PowerShell: .\setup-asana-sections.ps1

$TOKEN = $env:ASANA_TOKEN
if (-not $TOKEN) {
    Write-Host "Set your token first:" -ForegroundColor Red
    Write-Host '  $env:ASANA_TOKEN = "your_token_here"' -ForegroundColor Yellow
    exit 1
}
$HEADERS = @{
    Authorization = "Bearer $TOKEN"
    Accept        = "application/json"
    "Content-Type" = "application/json"
}

$PROJECTS = @(
    @{
        gid      = "1214148660020527"
        name     = "01 · Screening — Sanctions & Adverse Media"
        sections = @(
            "📥 New Screens",
            "🔍 Under Review",
            "⚠️  Hit — Escalated to MLRO",
            "✅ Cleared",
            "🗄️  Closed"
        )
    },
    @{
        gid      = "1214148631086118"
        name     = "02 · Central MLRO Daily Digest"
        sections = @(
            "📥 Today's Queue",
            "🔍 In Progress",
            "📋 Pending Sign-off",
            "✅ Completed"
        )
    },
    @{
        gid      = "1214148631336502"
        name     = "05 · STR/SAR/CTR/PMR GoAML Filings"
        sections = @(
            "📥 New Reports",
            "✏️  Draft",
            "🔍 MLRO Review",
            "📤 Filed to goAML",
            "✅ Closed"
        )
    },
    @{
        gid      = "1214148643568798"
        name     = "06 · FFR Incidents & Asset Freezes"
        sections = @(
            "📥 New Forensic Reports",
            "🔍 Under Investigation",
            "❄️  Freeze Request Sent",
            "✅ Resolved",
            "🗄️  Closed"
        )
    },
    @{
        gid      = "1214148898062562"
        name     = "07 · CDD/SDD/EDD/KYC — Customer Due Diligence"
        sections = @(
            "📥 New Due Diligence",
            "📄 Pending Documents",
            "🔍 Under Review",
            "✅ Approved",
            "❌ Rejected",
            "🗄️  Closed"
        )
    },
    @{
        gid      = "1214148661083263"
        name     = "08 · Transaction Monitoring"
        sections = @(
            "📥 New Alerts",
            "🔍 Under Review",
            "⚠️  Escalated to MLRO",
            "📤 SAR Filed",
            "✅ Cleared"
        )
    },
    @{
        gid      = "1214148898360626"
        name     = "10 · Shipments — Tracking"
        sections = @(
            "📥 New Consignments",
            "🔍 AML Screen Required",
            "✈️  In Transit",
            "🏦 At Vault",
            "🚨 Held — Review Required",
            "✅ Cleared & Delivered"
        )
    },
    @{
        gid      = "1214148910059926"
        name     = "15 · MLRO Workbench"
        sections = @(
            "📥 New Tasks",
            "🔍 In Progress",
            "⏳ Pending Decision",
            "✅ Approved",
            "🔄 Returned for Revision"
        )
    },
    @{
        gid      = "1214148855758874"
        name     = "16 · Supply Chain, ESG & LBMA Gold"
        sections = @(
            "📥 New Checks",
            "🔍 Under Review",
            "🚨 Sanctions Hit",
            "✅ Cleared"
        )
    }
)

Write-Host ""
Write-Host "Hawkeye Sterling · Asana Workflow Setup" -ForegroundColor Cyan
Write-Host ("─" * 54) -ForegroundColor DarkGray
Write-Host ""

foreach ($project in $PROJECTS) {
    Write-Host "  $($project.name)" -ForegroundColor Yellow

    # Get existing sections
    try {
        $existing = Invoke-RestMethod `
            -Uri "https://app.asana.com/api/1.0/projects/$($project.gid)/sections" `
            -Headers $HEADERS
        $existingNames = $existing.data | ForEach-Object { $_.name.ToLower().Trim() }
    } catch {
        Write-Host "    ⚠  Could not fetch sections: $_" -ForegroundColor Red
        continue
    }

    $created = 0
    $skipped = 0

    foreach ($section in $project.sections) {
        # Strip leading emoji for comparison
        $bare = ($section -replace '^[^\w]+', '').ToLower().Trim()
        $exists = $existingNames | Where-Object {
            $eb = ($_ -replace '^[^\w]+', '').ToLower().Trim()
            $eb -like "*$bare*" -or $bare -like "*$eb*"
        }

        if ($exists) {
            $skipped++
            continue
        }

        try {
            $body = @{ data = @{ name = $section } } | ConvertTo-Json -Compress
            Invoke-RestMethod `
                -Uri "https://app.asana.com/api/1.0/projects/$($project.gid)/sections" `
                -Method POST `
                -Headers $HEADERS `
                -Body $body | Out-Null
            $created++
        } catch {
            Write-Host "    ⚠  Failed to create '$section': $_" -ForegroundColor Red
        }
    }

    if ($created -gt 0) {
        Write-Host "    ✓  Created $created sections ($skipped already existed)" -ForegroundColor Green
    } else {
        Write-Host "    ✓  All sections already exist" -ForegroundColor DarkGreen
    }
    Write-Host ""
}

Write-Host ("─" * 54) -ForegroundColor DarkGray
Write-Host "Done. All 9 Asana projects are configured." -ForegroundColor Green
Write-Host ""
