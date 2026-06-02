# scripts/ai/review-snapshot.ps1
# Готовит компактный snapshot для вставки в ChatGPT / Claude / Codex

$ErrorActionPreference = "Continue"

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

function Write-CodeBlock {
    param(
        [string]$Command,
        [scriptblock]$Block
    )

    Write-Host '```text'
    Write-Host "> $Command"
    Write-Host ""
    & $Block
    Write-Host '```'
}

Enter-GitRoot

Write-Host "# AI Review Snapshot"
Write-Host ""
Write-Host "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

Write-Section "Repository"
Write-CodeBlock "git rev-parse --show-toplevel" {
    git rev-parse --show-toplevel
}

Write-Section "Branch"
Write-CodeBlock "git branch --show-current" {
    git branch --show-current
}

Write-Section "Latest commit"
Write-CodeBlock "git log -1 --oneline" {
    git log -1 --oneline
}

Write-Section "Git status"
Write-CodeBlock "git status --short" {
    git status --short
}

Write-Section "Diff stat - unstaged"
Write-CodeBlock "git diff --stat" {
    git diff --stat
}

Write-Section "Diff stat - staged"
Write-CodeBlock "git diff --cached --stat" {
    git diff --cached --stat
}

Write-Section "Changed files - unstaged"
Write-CodeBlock "git diff --name-only" {
    git diff --name-only
}

Write-Section "Changed files - staged"
Write-CodeBlock "git diff --cached --name-only" {
    git diff --cached --name-only
}

Write-Section "Untracked files"
Write-CodeBlock "git ls-files --others --exclude-standard" {
    git ls-files --others --exclude-standard
}

Write-Section "Useful next commands"
Write-Host '```powershell'
Write-Host "git add ."
Write-Host 'git commit -m "refactor: describe change"'
Write-Host "npm run build:server"
Write-Host "npx tsc --noEmit"
Write-Host '```'
