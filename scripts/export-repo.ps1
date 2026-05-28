param(
    [string]$OutputDir = ".\exports",
    [switch]$Zip,
    [switch]$IncludeBinaryInfo,
    [switch]$VerboseStats
)

$ErrorActionPreference = "Continue"

# =====================================================
# CONFIGURATION
# =====================================================

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$repoRoot = (Get-Location).Path
$repoName = Split-Path $repoRoot -Leaf

$outputFile = Join-Path $OutputDir "MASTER_PROJECT_INDEX_${timestamp}.md"
$zipFile = Join-Path $OutputDir "MASTER_PROJECT_INDEX_${timestamp}.zip"

$excludePatterns = @(
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".next",
    "out",
    "tmp",
    "temp",
    "bin",
    "obj",
    ".turbo",
    ".cache",
    ".vite",
    "release"
)

$textExtensions = @(
    "js","ts","jsx","tsx",
    "json","md","sql",
    "ps1","html","css",
    "scss","sass","less",
    "yml","yaml",
    "xml","cs","java",
    "kt","go","rs",
    "py","rb","php",
    "c","cpp","h",
    "sh","bat","cmd",
    "txt"
)

# =====================================================
# PREPARE OUTPUT
# =====================================================

if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

Set-Content $outputFile "# Repository Export"
Add-Content $outputFile ""
Add-Content $outputFile "| Property | Value |"
Add-Content $outputFile "|---|---|"
Add-Content $outputFile "| Repository | $repoName |"
Add-Content $outputFile "| Generated | $(Get-Date) |"
Add-Content $outputFile "| Root Path | $repoRoot |"
Add-Content $outputFile ""

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host " Enterprise Repo Exporter" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Repository : $repoName"
Write-Host "Output     : $outputFile"
Write-Host ""

# =====================================================
# FILE DISCOVERY
# =====================================================

Write-Host "Scanning repository..." -ForegroundColor Yellow

$allFiles = Get-ChildItem -Recurse -File | Where-Object {
    $path = $_.FullName

    foreach ($pattern in $excludePatterns) {
        if ($path -match [regex]::Escape($pattern)) {
            return $false
        }
    }

    return $true
}

$totalFiles = $allFiles.Count

Write-Host "Files discovered: $totalFiles" -ForegroundColor Green

# =====================================================
# REPOSITORY INDEX
# =====================================================

Add-Content $outputFile "## Repository Index"
Add-Content $outputFile ""

foreach ($file in $allFiles) {
    $relative = $file.FullName.Replace($repoRoot + "\", "")
    Add-Content $outputFile "- $relative"
}

Add-Content $outputFile ""
Add-Content $outputFile "---"
Add-Content $outputFile ""

# =====================================================
# STATISTICS
# =====================================================

Write-Host "Generating statistics..." -ForegroundColor Yellow

$languageStats = $allFiles |
    Group-Object Extension |
    Sort-Object Count -Descending

Add-Content $outputFile "## Repository Statistics"
Add-Content $outputFile ""
Add-Content $outputFile "### File Type Distribution"
Add-Content $outputFile ""
Add-Content $outputFile "| Extension | Count |"
Add-Content $outputFile "|---|---|"

foreach ($group in $languageStats) {
    Add-Content $outputFile "| $($group.Name) | $($group.Count) |"
}

Add-Content $outputFile ""

# =====================================================
# FOLDER ANALYSIS
# =====================================================
$folderStats = Get-ChildItem -Directory | ForEach-Object {
    [PSCustomObject]@{
        Folder = $_.Name
        Files = (
            Get-ChildItem $_ -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object {
                $path = $_.FullName
                foreach ($pattern in $excludePatterns) {
                    if ($path -match [regex]::Escape($pattern)) {
                        return $false
                    }
                }
                return $true
            }
        ).Count
    }
} | Sort-Object Files -Descending

Add-Content $outputFile "### Folder Distribution"
Add-Content $outputFile ""
Add-Content $outputFile "| Folder | Files |"
Add-Content $outputFile "|---|---|"

foreach ($folder in $folderStats) {
    Add-Content $outputFile "| $($folder.Folder) | $($folder.Files) |"
}

Add-Content $outputFile ""
Add-Content $outputFile "---"
Add-Content $outputFile ""

# =====================================================
# CONTENT EXPORT
# =====================================================

Write-Host "Exporting file contents..." -ForegroundColor Yellow

$processed = 0

foreach ($file in $allFiles) {

    $processed++

    $relative = $file.FullName.Replace($repoRoot + "\", "")
    $extension = $file.Extension.TrimStart(".").ToLower()

    Write-Host "[$processed/$totalFiles] $relative"

    Add-Content $outputFile "# $relative"
    Add-Content $outputFile ""

    Add-Content $outputFile "| Property | Value |"
    Add-Content $outputFile "|---|---|"
    Add-Content $outputFile "| Size | $([math]::Round($file.Length / 1KB, 2)) KB |"
    Add-Content $outputFile "| Modified | $($file.LastWriteTime) |"
    Add-Content $outputFile ""

    if ($textExtensions -contains $extension) {

        Add-Content $outputFile "~~~$extension"

        try {
            Get-Content $file.FullName -ErrorAction Stop |
                Add-Content $outputFile
        }
        catch {
            Add-Content $outputFile "ERROR READING FILE: $_"
        }

        Add-Content $outputFile "~~~"
    }
    else {

        if ($IncludeBinaryInfo) {
            Add-Content $outputFile "Binary/Unsupported file omitted"
        }
    }

    Add-Content $outputFile ""
    Add-Content $outputFile "---"
    Add-Content $outputFile ""
}

# =====================================================
# FINAL SUMMARY
# =====================================================

$totalLines = (Get-Content $outputFile | Measure-Object -Line).Lines
$totalSizeMB = [math]::Round((Get-Item $outputFile).Length / 1MB, 2)

Add-Content $outputFile "## Export Summary"
Add-Content $outputFile ""
Add-Content $outputFile "| Metric | Value |"
Add-Content $outputFile "|---|---|"
Add-Content $outputFile "| Total Files | $totalFiles |"
Add-Content $outputFile "| Export Lines | $totalLines |"
Add-Content $outputFile "| Export Size | $totalSizeMB MB |"
Add-Content $outputFile ""

# =====================================================
# OPTIONAL ZIP
# =====================================================

if ($Zip) {

    Write-Host "Creating ZIP archive..." -ForegroundColor Yellow

    Compress-Archive \
        -Path $outputFile \
        -DestinationPath $zipFile \
        -Force

    Write-Host "ZIP created: $zipFile" -ForegroundColor Green
}

# =====================================================
# FINAL OUTPUT
# =====================================================

Write-Host ""
Write-Host "===========================================" -ForegroundColor Green
Write-Host " EXPORT COMPLETE" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Markdown : $outputFile"

if ($Zip) {
    Write-Host "ZIP      : $zipFile"
}

Write-Host ""
Write-Host "Files    : $totalFiles"
Write-Host "Lines    : $totalLines"
Write-Host "Size MB  : $totalSizeMB"
Write-Host ""