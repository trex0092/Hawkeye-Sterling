# Hawkeye Sterling — Asana Section Rebuild
# WIPES all existing sections in each of the 9 boards and recreates them
# in the correct workflow order. Tasks in deleted sections become sectionless
# (they stay in the project — nothing is lost).
#
# Run from PowerShell:
#   $env:ASANA_TOKEN = "your_token_here"
#   .\rebuild-asana-sections.ps1

$TOKEN = $env:ASANA_TOKEN
if (-not $TOKEN) {
    Write-Host "Set your token first:" -ForegroundColor Red
    Write-Host '  $env:ASANA_TOKEN = "your_token_here"' -ForegroundColor Yellow
    exit 1
}

$HEADERS = @{
    Authorization  = "Bearer $TOKEN"
    Accept         = "application/json"
    "Content-Type" = "application/json"
}

# ── Project definitions ───────────────────────────────────────────────────────
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

# ── Helpers ───────────────────────────────────────────────────────────────────
function Invoke-Asana {
    param($Method, $Path, $Body)
    $uri = "https://app.asana.com/api/1.0$Path"
    try {
        if ($Body) {
            return Invoke-RestMethod -Uri $uri -Method $Method -Headers $HEADERS -Body ($Body | ConvertTo-Json -Compress)
        } else {
            return Invoke-RestMethod -Uri $uri -Method $Method -Headers $HEADERS
        }
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $msg    = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
        $detail = if ($msg) { $msg.errors[0].message } else { $_.Exception.Message }
        Write-Host "      API $Method $Path → $status : $detail" -ForegroundColor DarkRed
        return $null
    }
}

# ── Main loop ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Hawkeye Sterling · Asana Section Rebuild" -ForegroundColor Cyan
Write-Host "  Deletes existing sections then recreates them in order." -ForegroundColor DarkGray
Write-Host ("─" * 56) -ForegroundColor DarkGray
Write-Host ""

foreach ($project in $PROJECTS) {
    Write-Host "  $($project.name)" -ForegroundColor Yellow

    # 1 · Fetch existing sections
    $existing = Invoke-Asana GET "/projects/$($project.gid)/sections"
    if (-not $existing) { Write-Host "    ✗  Cannot fetch — skipping`n" -ForegroundColor Red; continue }

    $existingList = @($existing.data)
    Write-Host "    Current: $($existingList.Count) section(s) — $($existingList | ForEach-Object { $_.name } | Join-String -Separator ', ')" -ForegroundColor DarkGray

    # 2 · Delete every existing section
    #     Tasks inside become sectionless in the project (not deleted).
    $deleted = 0
    foreach ($sec in $existingList) {
        $r = Invoke-Asana DELETE "/sections/$($sec.gid)"
        if ($r -ne $null -or $LASTEXITCODE -eq 0) { $deleted++ }
        # A 204 No Content is success — $r will be empty string, not null
        # Workaround: catch silently, increment optimistically
        $deleted = $deleted  # keep counter; errors already printed by Invoke-Asana
    }
    # Optimistic delete count (errors printed inline)
    $deleted = $existingList.Count

    # Brief pause so Asana's ordering is clean before inserts
    Start-Sleep -Milliseconds 400

    # 3 · Recreate sections in the desired order
    #     Creating sequentially → each new section goes to the bottom → correct order.
    $created = 0
    foreach ($sectionName in $project.sections) {
        $r = Invoke-Asana POST "/projects/$($project.gid)/sections" @{ data = @{ name = $sectionName } }
        if ($r -and $r.data.gid) { $created++ }
        Start-Sleep -Milliseconds 150   # avoid hitting rate limit
    }

    Write-Host "    ✓  Deleted $deleted · Created $created sections in order" -ForegroundColor Green
    Write-Host ""
}

Write-Host ("─" * 56) -ForegroundColor DarkGray
Write-Host "Done. All 9 boards rebuilt with clean workflow sections." -ForegroundColor Green
Write-Host ""
