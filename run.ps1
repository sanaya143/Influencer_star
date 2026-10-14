# Starts the shop and Zylo Reach on one port. Run setup.ps1 once first, then:
#   powershell -ExecutionPolicy Bypass -File run.ps1            (port 8000)
#   powershell -ExecutionPolicy Bypass -File run.ps1 -Port 8010 (if 8000 is busy)
param([int]$Port = 8000, [switch]$NoBrowser)
$root = $PSScriptRoot
$venvPy = Join-Path $root 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) { Write-Host 'Not set up yet: run  powershell -ExecutionPolicy Bypass -File setup.ps1  first.' -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $root 'frontend\dist\index.html'))) { Write-Host 'The web app is not built: run setup.ps1 again.' -ForegroundColor Red; exit 1 }
$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) { Write-Host "Port $Port is already in use. Try:  run.ps1 -Port 8010" -ForegroundColor Red; exit 1 }

Write-Host "Starting Zylo on http://localhost:$Port  (Zylo Reach: http://localhost:$Port/admin). Press Ctrl+C to stop." -ForegroundColor Green
if (-not $NoBrowser) { Start-Job -ScriptBlock { param($u) Start-Sleep 6; Start-Process $u } -ArgumentList "http://localhost:$Port/admin" | Out-Null }
& $venvPy -m uvicorn app.main:app --app-dir (Join-Path $root 'backend') --host 127.0.0.1 --port $Port
