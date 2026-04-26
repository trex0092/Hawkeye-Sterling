# ─────────────────────────────────────────────────────────────────────────────
# smoke-asana.ps1 — Hawkeye Sterling end-to-end Asana smoke test (PowerShell)
#
# Usage (PowerShell):
#   $env:BASE_URL          = "https://your-site.netlify.app"
#   $env:ADMIN_TOKEN       = "your-admin-token"
#   $env:ASANA_TOKEN       = "your-asana-personal-access-token"
#   $env:ASANA_PROJECT_GID = "1214148630166524"
#   .\scripts\smoke-asana.ps1
#
# Optional cleanup (deletes smoke task from Asana after test):
#   $env:CLEANUP = "true"; .\scripts\smoke-asana.ps1
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
$failures = 0
$taskGid   = $null

function Write-Pass($msg) { Write-Host "  [PASS] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red;  $script:failures++ }
function Write-Warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Header($msg) { Write-Host "`n── $msg ──" -ForegroundColor Cyan }

# ── Env validation ──────────────────────────────────────────────────────────
Write-Header "Environment"

$BASE_URL          = $env:BASE_URL
$ADMIN_TOKEN       = $env:ADMIN_TOKEN
$ASANA_TOKEN       = $env:ASANA_TOKEN
$ASANA_PROJECT_GID = $env:ASANA_PROJECT_GID

foreach ($var in @("BASE_URL","ADMIN_TOKEN","ASANA_TOKEN","ASANA_PROJECT_GID")) {
    if (-not (Get-Variable $var -ValueOnly)) {
        Write-Host "  ERROR: `$env:$var is not set." -ForegroundColor Red
        exit 1
    }
}

$smokeSubject = "Hawkeye Smoke Test $([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$smokeCaseId  = "SMOKE-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$cleanup      = $env:CLEANUP -eq "true"

Write-Host "  BASE_URL          $BASE_URL"
Write-Host "  ASANA_PROJECT_GID $ASANA_PROJECT_GID"
Write-Host "  CLEANUP           $cleanup"

$asanaHeaders = @{ Authorization = "Bearer $ASANA_TOKEN"; Accept = "application/json" }
$appHeaders   = @{ Authorization = "Bearer $ADMIN_TOKEN"; "Content-Type" = "application/json" }

# ── CHECK 1: Asana API reachable ────────────────────────────────────────────
Write-Header "Check 1 · Asana API connectivity"
try {
    $r = Invoke-WebRequest -Uri "https://app.asana.com/api/1.0/users/me" `
         -Headers $asanaHeaders -UseBasicParsing
    if ($r.StatusCode -eq 200) { Write-Pass "Asana API reachable (HTTP 200)" }
    else                        { Write-Fail "Asana API returned HTTP $($r.StatusCode)" }
} catch {
    Write-Fail "Asana API request failed: $($_.Exception.Message)"
}

# ── CHECK 2: App /api/status ────────────────────────────────────────────────
Write-Header "Check 2 · App /api/status"
try {
    $r = Invoke-WebRequest -Uri "$BASE_URL/api/status" `
         -Headers $appHeaders -UseBasicParsing
    if ($r.StatusCode -eq 200) { Write-Pass "App /api/status returned HTTP 200" }
    else                        { Write-Fail "App /api/status returned HTTP $($r.StatusCode)" }
    Write-Host "  Response: $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))"
} catch {
    Write-Fail "App /api/status failed: $($_.Exception.Message)"
}

# ── CHECK 3: Trigger ongoing/run ────────────────────────────────────────────
Write-Header "Check 3 · POST /api/ongoing/run — create Asana task"

$body = @{
    subjects = @(@{
        name    = $smokeSubject
        id      = $smokeCaseId
        tier    = "high"
        cadence = "daily"
    })
} | ConvertTo-Json -Depth 5

$runResponse = $null
try {
    $r = Invoke-WebRequest -Uri "$BASE_URL/api/ongoing/run" `
         -Method POST -Headers $appHeaders -Body $body -UseBasicParsing
    $runResponse = $r.Content | ConvertFrom-Json
    Write-Host "  Response (first 400 chars): $($r.Content.Substring(0, [Math]::Min(400, $r.Content.Length)))"
} catch {
    Write-Fail "POST /api/ongoing/run failed: $($_.Exception.Message)"
}

$taskUrl    = $null
$skipReason = $null

if ($runResponse) {
    # Handle both array and single-object responses
    $subject = if ($runResponse -is [array]) { $runResponse[0] } else { $runResponse }
    $taskUrl    = $subject.asanaTaskUrl
    $skipReason = $subject.asanaSkipReason
    $taskGid    = $subject.asanaTaskGid

    if ($taskUrl) {
        Write-Pass "asanaTaskUrl returned: $taskUrl"
        # Extract GID from URL if not provided directly
        if (-not $taskGid) {
            $taskGid = ($taskUrl -split '/')[-1]
        }
    } elseif ($skipReason) {
        Write-Fail "asanaSkipReason set: '$skipReason' — task NOT created"
    } else {
        Write-Fail "asanaTaskUrl missing from response — check Netlify function logs"
    }
}

# ── CHECK 4: Verify task exists in Asana ───────────────────────────────────
Write-Header "Check 4 · Verify task exists in Asana"

if ($taskGid) {
    try {
        $r = Invoke-WebRequest -Uri "https://app.asana.com/api/1.0/tasks/$taskGid" `
             -Headers $asanaHeaders -UseBasicParsing
        $task = $r.Content | ConvertFrom-Json
        $taskName = $task.data.name
        if ($taskName -match "Smoke") {
            Write-Pass "Task found in Asana — name: '$taskName'"
        } else {
            Write-Warn "Task found but name unexpected: '$taskName'"
        }
    } catch {
        Write-Fail "Could not fetch task from Asana: $($_.Exception.Message)"
    }
} else {
    Write-Warn "No task GID available — skipping Asana task verification"
}

# ── CHECK 5: Verify attachment on task ─────────────────────────────────────
Write-Header "Check 5 · Verify JSON evidence attachment"

if ($taskGid) {
    try {
        $r = Invoke-WebRequest `
             -Uri "https://app.asana.com/api/1.0/tasks/$taskGid/attachments" `
             -Headers $asanaHeaders -UseBasicParsing
        $atts = ($r.Content | ConvertFrom-Json).data
        if ($atts.Count -gt 0) {
            Write-Pass "Attachment found on task ($($atts.Count) attachment(s))"
            $atts | ForEach-Object { Write-Host "    · $($_.name)" }
        } else {
            Write-Fail "No attachments on task — evidence pack was NOT uploaded"
        }
    } catch {
        Write-Fail "Could not fetch attachments: $($_.Exception.Message)"
    }
} else {
    Write-Warn "Skipping attachment check — no task GID"
}

# ── CHECK 6: Task in correct project ───────────────────────────────────────
Write-Header "Check 6 · Task is in correct Asana project"

if ($taskGid) {
    try {
        $r = Invoke-WebRequest `
             -Uri "https://app.asana.com/api/1.0/tasks/${taskGid}?opt_fields=projects" `
             -Headers $asanaHeaders -UseBasicParsing
        $projects = ($r.Content | ConvertFrom-Json).data.projects
        $match = $projects | Where-Object { $_.gid -eq $ASANA_PROJECT_GID }
        if ($match) {
            Write-Pass "Task is in correct project (GID $ASANA_PROJECT_GID)"
        } else {
            Write-Fail "Task project GIDs do not include $ASANA_PROJECT_GID"
            Write-Host "  Projects: $($projects | ConvertTo-Json -Compress)"
        }
    } catch {
        Write-Fail "Could not verify project: $($_.Exception.Message)"
    }
} else {
    Write-Warn "Skipping project check — no task GID"
}

# ── Cleanup ─────────────────────────────────────────────────────────────────
if ($cleanup -and $taskGid) {
    Write-Header "Cleanup · Deleting smoke-test task"
    try {
        Invoke-WebRequest -Uri "https://app.asana.com/api/1.0/tasks/$taskGid" `
            -Method DELETE -Headers $asanaHeaders -UseBasicParsing | Out-Null
        Write-Pass "Smoke-test task deleted from Asana"
    } catch {
        Write-Warn "Delete failed: $($_.Exception.Message) — delete manually (GID: $taskGid)"
    }
}

# ── Summary ─────────────────────────────────────────────────────────────────
Write-Header "Result"

if ($failures -eq 0) {
    Write-Host "`n  ALL CHECKS PASSED — Asana integration is working correctly.`n" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n  $failures CHECK(S) FAILED — Review output above and check Netlify logs.`n" -ForegroundColor Red
    exit 1
}
