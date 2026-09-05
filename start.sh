#!/bin/bash
# GlobalPay — One-click startup script
# Kills any old processes on dev ports, then starts backend + frontend

kill $(lsof -ti :5550) 2>/dev/null
kill $(lsof -ti :5173) 2>/dev/null
sleep 1

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Starting GlobalPay backend (port 5550)..."
cd "$SCRIPT_DIR/backend"
node server.js &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

sleep 4

echo "🌐 Starting GlobalPay frontend (port 5173)..."
cd "$SCRIPT_DIR/client"
npx vite --host &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

sleep 2
echo ""
echo "✅ Backend  → http://localhost:5550"
echo "✅ Frontend → http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"
wait
