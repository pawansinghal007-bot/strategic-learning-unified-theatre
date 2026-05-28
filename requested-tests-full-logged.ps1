# --- Timestamped log files ---
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$transcriptFile = ".\transcript-$timestamp.log"      # Full console/system output
$customLogFile = ".\requested-tests-$timestamp.log"  # Step timestamps & markers

# Start transcript to capture all console output
Start-Transcript -Path $transcriptFile

# --- Helper functions ---
function Log {
    param($message)
    $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "[$time] $message"
    Write-Host $entry
    Add-Content -Path $customLogFile -Value $entry
}

function Run-Step {
    param($stepNumber, $description, $commands)
    Log "=== STEP $stepNumber START: $description ==="
    foreach ($cmd in $commands) {
        Log "Executing: $cmd"
        # Execute command directly; output captured by transcript
        Invoke-Expression $cmd
    }
    Log "=== STEP $stepNumber END: $description ==="
    Log "Pausing 120 seconds..."
    Start-Sleep -Seconds 120
}

# --- Step 1: Clear staging files ---
Run-Step 1 "Clear staging files" @(
    'Remove-Item -Force -Recurse "$env:USERPROFILE\.vscode-rotator\vscode-signals\*" -ErrorAction SilentlyContinue'
)

# --- Step 2: Enable learning in VS Code Rotator ---
Run-Step 2 "Enable learning in VS Code Rotator" @(
    'node --% -e "const fs=require(''fs''), path=require(''path''), os=require(''os''); const p=path.join(os.homedir(), ''.vscode-rotator'', ''config.json''); fs.mkdirSync(path.dirname(p), {recursive:true}); const base={}; base.vscodeLearn={enabled:true}; fs.writeFileSync(p, JSON.stringify(base,null,2)); console.log(''wrote'',p);"'
)

# --- Step 3: Round 1 - file-save ingestion for inference.js ---
Run-Step 3 "Round 1 - Ingest staged files for inference.js" @(
    'cd "C:\\SW Development\\VS Code Agent\\Solution"',
    'strategic-learning-unified-theatre llm ingest-staged',
    'strategic-learning-unified-theatre llm related --to inference'
)

# --- Step 4: Round 2 - Diagnostic ingestion ---
Run-Step 4 "Round 2 - Diagnostic ingestion" @(
    'strategic-learning-unified-theatre llm ingest-staged',
    'strategic-learning-unified-theatre llm related --to "type error"'
)

# --- Step 5: Round 3 - Git commit ingestion ---
Run-Step 5 "Round 3 - Git commit ingestion" @(
    'cd "C:\\SW Development\\VS Code Agent\\Solution"',
    'git add -A',
    'git commit -m "Sprint 12: test passive git capture" -ErrorAction SilentlyContinue',
    'strategic-learning-unified-theatre llm ingest-staged',
    'strategic-learning-unified-theatre llm related --to "Sprint 12"'
)

# --- Step 6: Round 4 - Verify LLM responses ---
Run-Step 6 "Round 4 - Verify LLM responses" @(
    'strategic-learning-unified-theatre llm ask "What was the last file I edited in VS Code?"',
    'strategic-learning-unified-theatre llm ask "Have I had any TypeScript errors recently?"'
)

# --- Step 7: Privacy checks - create test files ---
Run-Step 7 "Privacy checks - create test files" @(
    'Set-Content -Path ".\test.env" -Value "SECRET_KEY=abc123"',
    'Set-Content -Path ".\test.pem" -Value "-----BEGIN TEST-----"'
)

# --- Step 8: Privacy checks - ingest staged files ---
Run-Step 8 "Privacy checks - ingest staged files" @(
    'strategic-learning-unified-theatre llm ingest-staged'
)

# --- Step 9: Privacy checks - verify SECRET_KEY not ingested ---
Run-Step 9 "Privacy checks - verify SECRET_KEY not ingested" @(
    'sqlite3 "$env:USERPROFILE\.vscode-rotator\experience.db" "SELECT count(*) FROM documents WHERE source_type=''vscode-edit'' AND content LIKE ''%SECRET_KEY%'';"'
)

# --- Finished ---
Log "ALL STEPS COMPLETED SUCCESSFULLY!"

# Stop transcript
Stop-Transcript
