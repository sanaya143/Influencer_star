# Starts the backend (8000) and the frontend dev server (5173). Run from the repo root:  ./start.ps1
$root = $PSScriptRoot
if (-not (Test-Path "$root/backend/.venv")) {
  python -m venv "$root/backend/.venv"
  & "$root/backend/.venv/Scripts/python.exe" -m pip install -r "$root/backend/requirements.txt"
}
if (-not (Test-Path "$root/frontend/node_modules")) { npm --prefix "$root/frontend" install }
Start-Process -NoNewWindow "$root/backend/.venv/Scripts/python.exe" -ArgumentList "-m","uvicorn","app.main:app","--app-dir","$root/backend","--port","8000"
npm --prefix "$root/frontend" run dev
