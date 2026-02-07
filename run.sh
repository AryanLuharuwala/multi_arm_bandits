#!/usr/bin/env bash
# Start both backend and frontend dev servers.
# Usage: ./run.sh

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== AR Building Management System ==="
echo ""

# Backend
echo "[1/2] Starting backend (FastAPI)..."
cd "$ROOT/backend"
pip install -q -r requirements.txt 2>/dev/null
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "      Backend PID: $BACKEND_PID  ->  http://localhost:8000"

# Frontend
echo "[2/2] Starting frontend (Vite)..."
cd "$ROOT/frontend"
npm install --silent 2>/dev/null
npx vite --host 0.0.0.0 --port 5173 &
FRONTEND_PID=$!
echo "      Frontend PID: $FRONTEND_PID  ->  http://localhost:5173"

echo ""
echo "Open http://localhost:5173 in your browser."
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
