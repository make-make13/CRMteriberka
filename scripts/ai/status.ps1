# scripts/ai/status.ps1
# Быстрый статус проекта для работы с Claude/Codex

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

Enter-GitRoot

Write-Section "Git root"
git rev-parse --show-toplevel

Write-Section "Current branch"
git branch --show-current

Write-Section "Latest commit"
git log -1 --oneline

Write-Section "Git status"
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
