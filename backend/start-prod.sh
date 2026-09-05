#!/bin/bash
cd "$(dirname "$0")"
nohup node server.js > /tmp/gp-backend-secure.log 2>&1 &
echo $! > /tmp/gp-backend.pid
sleep 8
if curl -sf http://localhost:5550/api/health > /dev/null 2>&1; then
  echo "✅ Backend running on :5550 (PID $(cat /tmp/gp-backend.pid))"
  cat /tmp/gp-backend-secure.log | tail -5
else
  echo "❌ Backend failed to start. Log:"
  cat /tmp/gp-backend-secure.log | tail -20
fi
