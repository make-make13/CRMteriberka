# scripts/ai/quick-check.ps1
# Быстрая проверка после правок агента: server build + TypeScript + git summary

$ErrorActionPreference = "Continue"

$failed = $false

function Enter-GitRoot {
    $root = git rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -eq 0 -and $root) {
        Set-Location $root
    } else {
        Write-Warning "Не удалось определить git root. Скрипт выполняется из текущей папки."
    }
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "## $Title"
    Write-Host ""
}

function Test-CommandExists {
    param([string]$CommandName)

    $cmd = Get-Command $CommandName -ErrorAction SilentlyContinue
    return $null -ne $cmd
}

function Run-Step {
    param(
        [string]$Title,
        [string]$CommandText,
        [scriptblock]$Command
    )

    Write-Section $Title
    Write-Host "> $CommandText"
    Write-Host ""

    & $Command
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "PASS: $Title"
    } else {
        Write-Host ""
        Write-Host "FAIL: $Title exit code $exitCode"
        $script:failed = $true
    }
}

Enter-GitRoot

Write-Host "# AI Quick Check"
Write-Host ""
Write-Host "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

Write-Section "Initial git status"
git status --short

if (-not (Test-CommandExists "npm")) {
    Write-Host "FAIL: npm не найден"
    $failed = $true
} else {
    Run-Step "Server build" "npm run build:server" {
        npm run build:server
    }
}

if (-not (Test-CommandExists "npx")) {
    Write-Host "FAIL: npx не найден"
    $failed = $true
} else {
    Run-Step "TypeScript check" "npx tsc --noEmit" {
        npx tsc --noEmit
    }
}

Write-Section "Final git status"
git status --short

Write-Section "Diff stat - unstaged"
git diff --stat

Write-Section "Diff stat - staged"
git diff --cached --stat

Write-Section "Changed files - unstaged"
git diff --name-only

Write-Section "Changed files - staged"
git diff --cached --name-only

Write-Section "Untracked files"
git ls-files --others --exclude-standard

Write-Section "Result"

if ($failed) {
    Write-Host "QUICK CHECK FAILED"
    exit 1
} else {
    Write-Host "QUICK CHECK PASSED"
    exit 0
}
