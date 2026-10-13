#!/usr/bin/env sh
# Zylo Reach security check: dependency vulnerability scans + the security test suite.
# Usage (from the repo root):  sh scripts/security-audit.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/backend/.venv/bin/python"; [ -x "$PY" ] || PY="$ROOT/backend/.venv/Scripts/python.exe"
FAILED=0
echo "== Backend dependencies (pip-audit) =="
"$PY" -m pip install --quiet -r "$ROOT/backend/requirements-dev.txt"
"$PY" -m pip_audit -r "$ROOT/backend/requirements.txt" --progress-spinner off || FAILED=1
"$PY" -m pip_audit --progress-spinner off || FAILED=1
echo "== Frontend dependencies (npm audit) =="
(cd "$ROOT/frontend" && npm audit --audit-level=moderate) || FAILED=1
echo "== Security tests =="
(cd "$ROOT/backend" && "$PY" -m pytest -q tests/test_security.py tests/test_mcp.py tests/test_settings.py) || FAILED=1
[ "$FAILED" = 0 ] && echo "Security check passed" || { echo "Security check FAILED"; exit 1; }
