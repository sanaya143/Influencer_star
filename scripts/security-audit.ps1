# Zylo Reach security check: dependency vulnerability scans + the security test suite.
# Usage (from the repo root):  powershell -ExecutionPolicy Bypass -File scripts/security-audit.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root 'backend/.venv/Scripts/python.exe'
$failed = $false

Write-Host "`n== Backend dependencies (pip-audit) ==" -ForegroundColor Cyan
& $py -m pip install --quiet -r (Join-Path $root 'backend/requirements-dev.txt')
& $py -m pip_audit -r (Join-Path $root 'backend/requirements.txt') --progress-spinner off; if ($LASTEXITCODE) { $failed = $true }
& $py -m pip_audit --progress-spinner off; if ($LASTEXITCODE) { $failed = $true }

Write-Host "`n== Frontend dependencies (npm audit) ==" -ForegroundColor Cyan
Push-Location (Join-Path $root 'frontend'); npm audit --audit-level=moderate; if ($LASTEXITCODE) { $failed = $true }; Pop-Location

Write-Host "`n== Security tests (headers, rate limits, token budget, attack probes, MCP gates, token masking) ==" -ForegroundColor Cyan
Push-Location (Join-Path $root 'backend')
& $py -m pytest -q tests/test_security.py tests/test_mcp.py tests/test_settings.py; if ($LASTEXITCODE) { $failed = $true }
Pop-Location

if ($failed) { Write-Host "`nSecurity check FAILED" -ForegroundColor Red; exit 1 }
Write-Host "`nSecurity check passed" -ForegroundColor Green
