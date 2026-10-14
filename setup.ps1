# One-time setup on a new Windows machine. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File setup.ps1
# Needs: Python 3.11+ (3.13 recommended) and Node.js 20+ installed and on PATH.
# Installs the pinned Python packages (requirements.txt) into backend\.venv, the web app's packages
# (frontend\package-lock.json), and builds the web app so run.ps1 can serve everything on one port.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

function Fail($msg) { Write-Host "`n$msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host "`n== $msg ==" -ForegroundColor Cyan }

Step 'Checking Python and Node.js'
$python = $null; $pyArgs = @()
foreach ($cand in @('py|-3.13', 'py|-3', 'python|')) {
  $exe, $arg = $cand.Split('|'); $args0 = @(); if ($arg) { $args0 = @($arg) }
  try {
    $v = & $exe @args0 -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
    if ($LASTEXITCODE -eq 0 -and $v -and [version]$v -ge [version]'3.11') { $python = $exe; $pyArgs = $args0; Write-Host "Python $v"; break }
  } catch { }
}
if (-not $python) { Fail 'Python 3.11 or newer was not found. Install it from https://www.python.org/downloads/ (tick "Add python.exe to PATH") and run setup again.' }
try { $node = (node --version).TrimStart('v') } catch { Fail 'Node.js was not found. Install the LTS version from https://nodejs.org/ and run setup again.' }
if ([version]$node -lt [version]'20.0') { Fail "Node.js $node is too old; install version 20 or newer from https://nodejs.org/." }
Write-Host "Node.js $node"

Step 'Creating the Python environment (backend\.venv)'
$venvPy = Join-Path $root 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) { & $python @pyArgs -m venv (Join-Path $root 'backend\.venv') }
& $venvPy -m pip install --upgrade pip
Step 'Installing Python packages (requirements.txt)'
& $venvPy -m pip install -r (Join-Path $root 'requirements.txt')
if ($LASTEXITCODE) { Fail 'Installing the Python packages failed (see the messages above).' }

Step 'Installing web app packages (npm ci)'
Push-Location (Join-Path $root 'frontend')
npm ci
if ($LASTEXITCODE) { Pop-Location; Fail 'Installing the web app packages failed (see the messages above).' }
Step 'Building the web app'
npm run build
if ($LASTEXITCODE) { Pop-Location; Fail 'Building the web app failed (see the messages above).' }
Pop-Location

if (-not (Test-Path (Join-Path $root '.env')) -and (Test-Path (Join-Path $root '.env.example'))) {
  Copy-Item (Join-Path $root '.env.example') (Join-Path $root '.env')
  Write-Host "`nCreated .env from .env.example (optional settings)."
}

Write-Host "`nSetup complete. Start the app with:  powershell -ExecutionPolicy Bypass -File run.ps1" -ForegroundColor Green
Write-Host 'Then choose the AI model and paste its access token in Zylo Reach > Settings (or run without one: it works offline).'
