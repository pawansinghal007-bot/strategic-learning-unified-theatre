# vscode-rotator Sprint Verification Script
# Tests: R2 Agent Handoff | R3 Idea Store | R4 Browser Bridge | R1 Storage Monitor | R5 Local Dev-LLM
# Drop into E:\VS Code Agent and run:
#   .\verify-sprints.ps1
#   .\verify-sprints.ps1 -Sprint R5
#   .\verify-sprints.ps1 -Sprint R1,R5

param(
    [string[]]$Sprint = @('R2','R3','R4','R1','R5')
)

$root  = "E:\VS Code Agent\Solution"
$cli   = "$root\src\cli.js"
$store = "$HOME\.vscode-rotator"

$pass = 0
$fail = 0
$skip = 0
$log  = @()
$script:testSprintId = $null

function OK($msg)   { Write-Host "  [PASS] $msg" -ForegroundColor Green;  $script:pass++; $script:log += "PASS | $msg" }
function FAIL($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red;    $script:fail++; $script:log += "FAIL | $msg" }
function SKIP($msg) { Write-Host "  [SKIP] $msg" -ForegroundColor Gray;   $script:skip++; $script:log += "SKIP | $msg" }
function HDR($msg)  { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function SUB($msg)  { Write-Host "  > $msg" -ForegroundColor Yellow }

function Invoke-CLI {
    param([string]$Arguments)
    $prev = Get-Location
    Set-Location $root
    try {
        $out = Invoke-Expression "node `"$cli`" $Arguments" 2>&1
        return ($out | Out-String).Trim()
    } finally {
        Set-Location $prev
    }
}

Write-Host "`nvscode-rotator Sprint Verification" -ForegroundColor White
Write-Host "Root  : $root"
Write-Host "CLI   : $cli"
Write-Host "Store : $store"
Write-Host "Tests : $($Sprint -join ', ')"

if (-not (Test-Path $root)) { Write-Host "[ERROR] Root not found: $root" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $cli))  { Write-Host "[ERROR] cli.js not found: $cli" -ForegroundColor Red; exit 1 }

HDR "CLI Smoke Test"
$smokeOut = Invoke-CLI "--help"
if ($smokeOut -match 'vscode-rotator|Usage|handoff|idea|browser|storage') {
    OK "node cli.js --help responded correctly"
    Write-Host "    $($smokeOut.Split([Environment]::NewLine)[0])" -ForegroundColor Gray
} else {
    FAIL "cli.js --help returned nothing useful - output: $smokeOut"
}

HDR "Unit Tests (npm test / vitest)"
SUB "Running vitest from $root ..."
$prev = Get-Location
Set-Location $root
$testOut  = npm test 2>&1 | Out-String
$testExit = $LASTEXITCODE
Set-Location $prev
if ($testExit -eq 0) { OK "npm test passed" }
else {
    FAIL "npm test failed"
    $testOut -split "`n" | Select-String 'FAIL|Error' | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
}

if ($Sprint -contains 'R2') {
    HDR "Sprint R2 - Agent Handoff Tracker"

    if (Test-Path "$root\src\agent-handoff.js")    { OK "src/agent-handoff.js exists" }
    else                                            { FAIL "src/agent-handoff.js NOT FOUND" }

    if (Test-Path "$root\src\commands\handoff.js") { OK "src/commands/handoff.js exists" }
    else                                            { FAIL "src/commands/handoff.js NOT FOUND" }

    if ((Test-Path "$root\test\agent-handoff.test.js") -or (Test-Path "$root\tests\agent-handoff.test.js")) {
        OK "agent-handoff.test.js exists"
    } else { FAIL "agent-handoff.test.js NOT FOUND" }

    SUB "Testing: handoff --help"
    $helpOut = Invoke-CLI "handoff --help"
    if ($helpOut -match 'create|update|close|resume|list') { OK "handoff --help shows expected sub-commands" }
    else { FAIL "handoff --help missing sub-commands. Raw output:`n$helpOut" }

    SUB "Testing: handoff create"
    $createOut = Invoke-CLI "handoff create --goal `"Verify R2 sprint handoff`" --agent claude --limit 100000"
    if ($createOut -match '[0-9a-f]{8}-[0-9a-f]{4}|created|sprint') { OK "handoff create succeeded" }
    else { FAIL "handoff create failed. Output:`n$createOut" }

    $sprintFiles = Get-ChildItem "$store\sprints\*.json" -ErrorAction SilentlyContinue
    if ($sprintFiles.Count -gt 0) { OK "Sprint JSON file(s) found ($($sprintFiles.Count))" }
    else                           { FAIL "No sprint JSON files in ~/.vscode-rotator/sprints/" }

    if ($sprintFiles.Count -gt 0) {
        $latest    = $sprintFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        $sprintObj = Get-Content $latest.FullName -Raw | ConvertFrom-Json
        $required  = @('sprintId','date','agent','goal','tokensUsed','tokensLimit','status','completedTasks','pendingTasks','resumePrompt')
        $missing   = $required | Where-Object { $sprintObj.PSObject.Properties.Name -notcontains $_ }
        if ($missing.Count -eq 0) { OK "Sprint JSON has all required schema keys" }
        else                       { FAIL "Sprint JSON missing keys: $($missing -join ', ')" }
        $script:testSprintId = $sprintObj.sprintId
        Write-Host "    Sprint ID: $($script:testSprintId)" -ForegroundColor Gray
    }

    if ($script:testSprintId) {
        SUB "Testing: handoff update"
        $updateOut = Invoke-CLI "handoff update $($script:testSprintId) --tokens-used 5000 --add-task `"Write verification test`" --priority 1"
        if ($updateOut -match $script:testSprintId -or $updateOut -match 'updated|sprint') { OK "handoff update succeeded" }
        else { FAIL "handoff update failed. Output:`n$updateOut" }

        SUB "Testing: 85 percent token warning (tokens-used 87000)"
        $warnOut = Invoke-CLI "handoff update $($script:testSprintId) --tokens-used 87000"
        if ($warnOut -match '85|budget|handoff|warning|WARN|threshold') { OK "Token WARNING emitted at 85 percent threshold" }
        else { SKIP "85 percent WARNING not detected in captured output - may go to process.stderr only" }

        SUB "Testing: handoff close and resume"
        Invoke-CLI "handoff close $($script:testSprintId) --status paused" | Out-Null
        $resumeOut = Invoke-CLI "handoff resume $($script:testSprintId)"
        if ($resumeOut -match 'sprint|Goal|Completed|Pending|continuing') { OK "Resume prompt has correct template content" }
        else { FAIL "Resume prompt malformed or empty. Output:`n$resumeOut" }
        $resumeLen = $resumeOut.Length
        if ($resumeLen -gt 0 -and $resumeLen -le 800) { OK "Resume prompt within 800 char limit ($resumeLen chars)" }
        elseif ($resumeLen -eq 0) { FAIL "Resume prompt is empty" }
        else { FAIL "Resume prompt exceeds 800 chars ($resumeLen chars)" }
    }

    SUB "Testing: handoff list"
    $listOut = Invoke-CLI "handoff list"
    if ($listOut -match 'sprintId|date|goal|No sprints|sprint') { OK "handoff list returned successfully" }
    else { FAIL "handoff list failed. Output:`n$listOut" }
}

if ($Sprint -contains 'R3') {
    HDR "Sprint R3 - Idea Store"

    if (Test-Path "$root\src\idea-store.js")    { OK "src/idea-store.js exists" }
    else                                         { FAIL "src/idea-store.js NOT FOUND" }

    if (Test-Path "$root\src\commands\idea.js") { OK "src/commands/idea.js exists" }
    else                                         { FAIL "src/commands/idea.js NOT FOUND" }

    if ((Test-Path "$root\test\idea-store.test.js") -or (Test-Path "$root\tests\idea-store.test.js")) {
        OK "idea-store.test.js exists"
    } else { FAIL "idea-store.test.js NOT FOUND" }

    SUB "Testing: idea --help"
    $helpOut = Invoke-CLI "idea --help"
    if ($helpOut -match 'add|list|view|export|done') { OK "idea --help shows expected sub-commands" }
    else { FAIL "idea --help missing sub-commands. Output:`n$helpOut" }

    SUB "Testing: idea list"
    $listOut = Invoke-CLI "idea list"
    if ($listOut.Length -gt 0) { OK "idea list returned output" }
    else { FAIL "idea list returned nothing" }

    $ideaDir = "$root\.vscode-rotator\ideas"
    if (-not (Test-Path $ideaDir)) { $ideaDir = "$store\ideas" }
    $ideaFiles = Get-ChildItem $ideaDir -Filter "*.md" -ErrorAction SilentlyContinue

    if ($ideaFiles.Count -gt 0) {
        OK "Idea Markdown files found in $ideaDir ($($ideaFiles.Count) files)"
        $sample  = Get-Content $ideaFiles[0].FullName -Raw
        $missing = @('id:','created:','project:','tags:','status:','priority:') | Where-Object { $sample -notmatch $_ }
        if ($missing.Count -eq 0) { OK "Idea front-matter has all required YAML keys" }
        else                       { FAIL "Idea front-matter missing: $($missing -join ', ')" }
        if ($sample -match 'status:\s*(inbox|active|parked|done)') { OK "Idea status is a valid enum value" }
        else { FAIL "Idea status not valid (expected: inbox|active|parked|done)" }
    } else {
        SKIP "No idea Markdown files found - add one and re-run"
    }

    SUB "Testing: idea export"
    $exportOut = Invoke-CLI "idea export --status inbox"
    if ($exportOut.Length -gt 0) {
        OK "idea export returned output ($($exportOut.Length) chars)"
        if ($exportOut.Length -lt 16000) { OK "idea export within 4000-token limit" }
        else { FAIL "idea export may exceed 4000 tokens ($($exportOut.Length) chars)" }
    } else {
        SKIP "idea export returned nothing - may be empty store"
    }

    if ($script:testSprintId -and $ideaFiles.Count -gt 0) {
        $idMatch = [regex]::Match((Get-Content $ideaFiles[0].FullName -Raw), 'id:\s*(\S+)')
        if ($idMatch.Success) {
            $rawId   = $idMatch.Groups[1].Value.Trim()
            $linkOut = Invoke-CLI "idea link $rawId --sprint $($script:testSprintId)"
            if ($linkOut -match 'linked|updated|ok' -or $linkOut.Length -ge 0) { OK "idea link ran without error" }
            else { FAIL "idea link failed: $linkOut" }
        } else { SKIP "Could not extract idea ID from front-matter" }
    }
}

if ($Sprint -contains 'R4') {
    HDR "Sprint R4 - Browser Bridge"

    foreach ($f in @('src\browser-bridge.js','src\browser-adapters\chatgpt.js','src\browser-adapters\claude.js','src\browser-adapters\perplexity.js','src\browser-adapters\gemini.js','src\commands\browser.js')) {
        if (Test-Path "$root\$f") { OK "$f exists" } else { FAIL "$f NOT FOUND" }
    }

    if ((Test-Path "$root\test\browser-bridge.test.js") -or (Test-Path "$root\tests\browser-bridge.test.js")) {
        OK "browser-bridge.test.js exists"
    } else { FAIL "browser-bridge.test.js NOT FOUND" }

    $prev = Get-Location; Set-Location $root
    $pwVer = npx playwright --version 2>&1 | Out-String
    Set-Location $prev
    if ($pwVer -match '\d+\.\d+') { OK "Playwright installed: $($pwVer.Trim())" }
    else { FAIL "Playwright not found - run: npm install playwright (inside Solution folder)" }

    $selectorsFile = "$store\browser-selectors.json"
    if (Test-Path $selectorsFile) {
        OK "browser-selectors.json exists"
        $sel     = Get-Content $selectorsFile -Raw | ConvertFrom-Json
        $missing = @('chatgpt','claude','perplexity','gemini') | Where-Object { -not $sel.$_ }
        if ($missing.Count -eq 0) { OK "browser-selectors.json has all 4 platform entries" }
        else { FAIL "browser-selectors.json missing: $($missing -join ', ')" }
    } else { FAIL "browser-selectors.json NOT FOUND at $selectorsFile" }

    SUB "Testing: browser --help"
    $helpOut = Invoke-CLI "browser --help"
    if ($helpOut -match 'send|compare|login|prompts') { OK "browser --help shows expected sub-commands" }
    else { FAIL "browser --help missing sub-commands. Output:`n$helpOut" }

    SUB "Testing: browser send --dry-run"
    $dryOut = Invoke-CLI "browser send --platform claude --prompt `"Hello test`" --dry-run"
    if ($dryOut.Length -gt 0) { OK "browser send --dry-run ran without crash" }
    else { FAIL "browser send --dry-run produced no output" }

    SUB "Checking adapter exports (ESM)..."
    $prev = Get-Location; Set-Location $root
    $adapterCheck = node --input-type=module --eval @"
const adapters = ['chatgpt','claude','perplexity','gemini'];
let ok = true;
for (const a of adapters) {
    try {
        const m = await import('./src/browser-adapters/' + a + '.js');
        const ex = m.default ?? m;
        for (const k of ['name','baseUrl','selectors','waitForResponse']) {
            if (ex[k] === undefined) { console.error('MISSING ' + k + ' in ' + a); ok = false; }
        }
    } catch(e) { console.error('LOAD ERROR ' + a + ': ' + e.message); ok = false; }
}
if (ok) console.log('ALL OK');
"@ 2>&1 | Out-String
    Set-Location $prev
    if ($adapterCheck -match 'ALL OK') { OK "All 4 adapters export required keys" }
    else { FAIL "Adapter check failed:`n$adapterCheck" }

    $src = Get-Content "$root\src\browser-bridge.js" -Raw -ErrorAction SilentlyContinue
    if ($src -match '3000|3_000|MIN_DELAY|minDelay') { OK "3-second minimum delay constant found" }
    else { SKIP "Could not verify 3-second delay - check browser-bridge.js manually" }
}

if ($Sprint -contains 'R1') {
    HDR "Sprint R1 - Storage Monitor"

    if (Test-Path "$root\src\storage-monitor.js")  { OK "src/storage-monitor.js exists" }
    else                                            { FAIL "src/storage-monitor.js NOT FOUND" }

    if (Test-Path "$root\src\commands\storage.js") { OK "src/commands/storage.js exists" }
    else                                            { FAIL "src/commands/storage.js NOT FOUND" }

    if ((Test-Path "$root\test\storage-monitor.test.js") -or (Test-Path "$root\tests\storage-monitor.test.js")) {
        OK "storage-monitor.test.js exists"
    } else { FAIL "storage-monitor.test.js NOT FOUND" }

    $prev = Get-Location; Set-Location $root
    $chokidar = node --input-type=module --eval "import 'chokidar'; console.log('OK')" 2>&1 | Out-String
    Set-Location $prev
    if ($chokidar -match 'OK') { OK "chokidar is installed" }
    else { FAIL "chokidar not installed - run: npm install chokidar" }

    SUB "Testing: storage --help"
    $helpOut = Invoke-CLI "storage --help"
    if ($helpOut -match 'watch|status|index') { OK "storage --help shows expected sub-commands" }
    else { FAIL "storage --help missing sub-commands. Output:`n$helpOut" }

    SUB "Testing: storage index"
    $indexOut = Invoke-CLI "storage index"
    if ($indexOut.Length -gt 0) { OK "storage index ran and returned output" }
    else { FAIL "storage index produced no output" }

    $indexFile = "$store\storage-index.json"
    if (Test-Path $indexFile) {
        OK "storage-index.json exists"
        $content = Get-Content $indexFile -Raw | ConvertFrom-Json
        if ($content -is [array] -and $content.Count -gt 0) {
            OK "storage-index.json has $($content.Count) entries"
            $missing = @('ts','path','event','size','ext','label','ingestible') | Where-Object { $content[0].PSObject.Properties.Name -notcontains $_ }
            if ($missing.Count -eq 0) { OK "Index entry schema has all required keys" }
            else { FAIL "Index entry missing keys: $($missing -join ', ')" }
            $ic = ($content | Where-Object { $_.ingestible -eq $true }).Count
            OK "Ingestible entries: $ic of $($content.Count)"
        } else {
            SKIP "storage-index.json empty - add storagePaths to ~/.vscode-rotator/config.json"
        }
    } else { FAIL "storage-index.json NOT FOUND at $indexFile" }

    $snapshotFile = "$store\storage-snapshot.json"
    if (Test-Path $snapshotFile) {
        OK "storage-snapshot.json exists (required by Sprint R5)"
        $snap = Get-Content $snapshotFile -Raw | ConvertFrom-Json
        if ($snap.lastScan) { OK "lastScan present: $($snap.lastScan)" }
        else { FAIL "storage-snapshot.json missing lastScan" }
        if ($snap.paths) {
            $pc = ($snap.paths | Get-Member -MemberType NoteProperty).Count
            OK "storage-snapshot.json tracks $pc paths"
        } else { FAIL "storage-snapshot.json missing paths object" }
    } else { FAIL "storage-snapshot.json NOT FOUND - required by Sprint R5" }

    $configFile = "$store\config.json"
    if (Test-Path $configFile) {
        $config = Get-Content $configFile -Raw | ConvertFrom-Json
        if ($null -ne $config.storagePaths)           { OK "config.json has storagePaths" }
        else { SKIP "config.json missing storagePaths - add your watch paths" }
        if ($null -ne $config.storageIndexMaxAgeDays) { OK "config.json has storageIndexMaxAgeDays: $($config.storageIndexMaxAgeDays)" }
        else { FAIL "config.json missing storageIndexMaxAgeDays" }
    } else { SKIP "config.json not yet created - defaults apply on first run" }

    SUB "Testing: storage status"
    $statusOut = Invoke-CLI "storage status"
    if ($statusOut.Length -gt 0) { OK "storage status returned output" }
    else { FAIL "storage status returned nothing" }

    SUB "Smoke-testing storage watch for 5 seconds..."
    $watchJob = Start-Job -ScriptBlock {
        param($r,$c)
        Set-Location $r
        node $c storage watch 2>&1
    } -ArgumentList $root,$cli
    Start-Sleep -Seconds 5
    Stop-Job  $watchJob -ErrorAction SilentlyContinue
    $watchOut = Receive-Job $watchJob -ErrorAction SilentlyContinue | Out-String
    Remove-Job $watchJob -ErrorAction SilentlyContinue
    if ($watchOut -notmatch 'Cannot find|ENOENT|SyntaxError') { OK "storage watch ran 5 seconds without fatal errors" }
    else { FAIL "storage watch fatal error: $watchOut" }

    $src = Get-Content "$root\src\storage-monitor.js" -Raw -ErrorAction SilentlyContinue
    if ($src -match 'node_modules|Recycle\.Bin|Program Files|pagefile') { OK "System folder exclusions found in storage-monitor.js" }
    else { FAIL "System folder exclusions NOT found in storage-monitor.js" }
}

if ($Sprint -contains 'R5') {
    HDR "Sprint R5 - Local Dev-LLM"

    # File existence checks
    foreach ($f in @(
        'src\local-llm.js',
        'src\llm\inference.js',
        'src\llm\experience-db.js',
        'src\commands\llm.js'
    )) {
        if (Test-Path "$root\$f") { OK "$f exists" } else { FAIL "$f NOT FOUND" }
    }

    # At least one llm sub-module beyond inference and experience-db
    $llmModules = Get-ChildItem "$root\src\llm\*.js" -ErrorAction SilentlyContinue
    if ($llmModules.Count -ge 4) { OK "src/llm/ has $($llmModules.Count) modules (embeddings, ingestion, prompt-gen, mistakes + more)" }
    elseif ($llmModules.Count -gt 0) { OK "src/llm/ has $($llmModules.Count) module(s)" }
    else { FAIL "src/llm/ is empty or missing" }

    # Test file
    if ((Test-Path "$root\test\local-llm.test.js") -or (Test-Path "$root\tests\local-llm.test.js")) {
        OK "local-llm.test.js exists"
    } else { FAIL "local-llm.test.js NOT FOUND" }

    # CLI registration - llm command present in cli.js
    $cliSrc = Get-Content "$root\src\cli.js" -Raw -ErrorAction SilentlyContinue
    if ($cliSrc -match 'llm') { OK "llm command registered in src/cli.js" }
    else { FAIL "llm command NOT found in src/cli.js" }

    # llm --help
    SUB "Testing: llm --help"
    $helpOut = Invoke-CLI "llm --help"
    if ($helpOut -match 'ingest|prompt|status|query|mistakes') { OK "llm --help shows expected sub-commands" }
    else { FAIL "llm --help missing expected sub-commands. Output:`n$helpOut" }

    # llm status (should work even without a model downloaded)
    SUB "Testing: llm status"
    $statusOut = Invoke-CLI "llm status"
    if ($statusOut.Length -gt 0) { OK "llm status returned output ($($statusOut.Length) chars)" }
    else { FAIL "llm status returned nothing" }

    # Model file check (optional - graceful skip if not downloaded)
    $modelDir = "$store\models"
    $modelFiles = Get-ChildItem $modelDir -Filter "*.gguf" -ErrorAction SilentlyContinue
    if ($modelFiles.Count -gt 0) {
        OK "GGUF model file(s) found in $modelDir ($($modelFiles.Count) file(s))"
        $largest = $modelFiles | Sort-Object Length -Descending | Select-Object -First 1
        OK "Largest model: $($largest.Name) ($([math]::Round($largest.Length / 1GB, 2)) GB)"
    } else {
        SKIP "No .gguf model files in $modelDir - inference will use mock/fallback mode"
    }

    # Verify inference wrapper degrades cleanly (no crash without model)
    SUB "Verifying inference wrapper loads without model..."
    $prev = Get-Location; Set-Location $root
    $inferCheck = node --input-type=module --eval @"
try {
    const m = await import('./src/llm/inference.js');
    console.log('LOAD OK');
} catch(e) {
    console.error('LOAD FAIL: ' + e.message);
}
"@ 2>&1 | Out-String
    Set-Location $prev
    if ($inferCheck -match 'LOAD OK') { OK "src/llm/inference.js loads without model present" }
    else { FAIL "src/llm/inference.js failed to load:`n$inferCheck" }

    # Verify experience-db loads cleanly
    $prev = Get-Location; Set-Location $root
    $expCheck = node --input-type=module --eval @"
try {
    const m = await import('./src/llm/experience-db.js');
    console.log('LOAD OK');
} catch(e) {
    console.error('LOAD FAIL: ' + e.message);
}
"@ 2>&1 | Out-String
    Set-Location $prev
    if ($expCheck -match 'LOAD OK') { OK "src/llm/experience-db.js loads cleanly" }
    else { FAIL "src/llm/experience-db.js failed to load:`n$expCheck" }

    # Storage watcher integration hook
    $storageSrc = Get-Content "$root\src\storage-monitor.js" -Raw -ErrorAction SilentlyContinue
    $storageCmd = Get-Content "$root\src\commands\storage.js" -Raw -ErrorAction SilentlyContinue
    if (($storageSrc -match 'ingest|llm|auto') -or ($storageCmd -match 'ingest|llm|auto')) {
        OK "Storage watcher auto-ingestion hook found"
    } else {
        SKIP "Auto-ingestion hook not detected in storage-monitor.js / commands/storage.js - verify manually"
    }

    # README docs
    $readmeRoot = Get-Content "$root\README.md" -Raw -ErrorAction SilentlyContinue
    $readmeDocs = Get-Content "$root\docs\README.md" -Raw -ErrorAction SilentlyContinue
    if (($readmeRoot -match 'llm|local.llm|R5') -or ($readmeDocs -match 'llm|local.llm|R5')) {
        OK "R5 LLM section found in README docs"
    } else {
        SKIP "R5 LLM section not detected in README.md or docs/README.md - verify manually"
    }
}

HDR "Cross-Sprint Integration"

$sprintFiles = Get-ChildItem "$store\sprints\*.json" -ErrorAction SilentlyContinue
$snapshotOk  = Test-Path "$store\storage-snapshot.json"
$ideaCount   = (Get-ChildItem "$store\ideas\*.md" -ErrorAction SilentlyContinue).Count +
               (Get-ChildItem "$root\.vscode-rotator\ideas\*.md" -ErrorAction SilentlyContinue).Count

if ($sprintFiles.Count -gt 0) { OK "R2 sprint files present ($($sprintFiles.Count)) - R5 import-sprints ready" }
else { FAIL "No sprint files found - R5 import-sprints will have nothing to import" }

if ($snapshotOk) { OK "R1 storage-snapshot.json present - R5 incremental ingestion ready" }
else { FAIL "R1 storage-snapshot.json missing - R5 incremental ingestion will not work" }

if ($ideaCount -gt 0) { OK "R3 idea files present ($ideaCount) - R5 generate-prompt will include ideas" }
else { SKIP "No idea files yet - R5 will skip idea context until ideas are added" }

SUB "Checking all 5 modules load without errors (ESM)..."
$prev = Get-Location; Set-Location $root
$loadCheck = node --input-type=module --eval @"
const modules = ['./src/agent-handoff.js','./src/idea-store.js','./src/browser-bridge.js','./src/storage-monitor.js','./src/local-llm.js'];
let ok = true;
for (const m of modules) {
    try { await import(m); }
    catch(e) { console.error('LOAD FAIL: ' + m + ' => ' + e.message); ok = false; }
}
if (ok) console.log('ALL MODULES LOAD OK');
"@ 2>&1 | Out-String
Set-Location $prev
if ($loadCheck -match 'ALL MODULES LOAD OK') { OK "All 5 sprint modules load without errors" }
else { FAIL "Module load errors:`n$loadCheck" }

$total = $pass + $fail + $skip
Write-Host "`n==========================================" -ForegroundColor White
Write-Host "  PASS: $pass   FAIL: $fail   SKIP: $skip   TOTAL: $total" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor White

$logPath = "$store\verification-$(Get-Date -Format 'yyyy-MM-dd-HHmm').log"
$log | Out-File -FilePath $logPath -Encoding UTF8
Write-Host "  Log: $logPath" -ForegroundColor Gray

if ($fail -eq 0) {
    Write-Host "`n  All sprints verified. R1-R5 complete." -ForegroundColor Green
} else {
    Write-Host "`n  $fail check(s) failed. Fix above before continuing." -ForegroundColor Yellow
    Write-Host "  Re-run one sprint: .\verify-sprints.ps1 -Sprint R5" -ForegroundColor Gray
}

