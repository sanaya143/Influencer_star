#!/usr/bin/env bash
# Starts the backend (8000) and the frontend dev server (5173). Run from the repo root: ./start.sh
set -e
cd "$(dirname "$0")"
if [ ! -d backend/.venv ]; then python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt; fi
[ -d frontend/node_modules ] || npm --prefix frontend install
backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --port 8000 &
trap 'kill $!' EXIT
npm --prefix frontend run dev
