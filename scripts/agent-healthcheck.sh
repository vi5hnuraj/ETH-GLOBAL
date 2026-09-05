#!/usr/bin/env bash
# Tests an AI agent end-to-end against the local backend.
# Usage: bash scripts/agent-healthcheck.sh gpay_sk_YOUR_KEY
KEY="$1"
[ -z "$KEY" ] && echo "Usage: bash scripts/agent-healthcheck.sh gpay_sk_..." && exit 1
BASE="http://localhost:5550/api/agents"
pass(){ echo "  PASS - $1"; }
fail(){ echo "  FAIL - $1"; }

R=$(curl -s -m 20 -w "\n%{http_code}" "$BASE/balance" -H "Authorization: Bearer $KEY")
CODE=$(echo "$R" | tail -1)
BODY=$(echo "$R" | head -1)
[ "$CODE" = "200" ] && echo "$BODY" | grep -q '"success":true' && pass "key is valid, wallet exists: $(echo "$BODY" | grep -oE '"wallet":"0x[0-9a-f]+"' | head -c 30)" || fail "balance (HTTP $CODE) - wrong key?"

R=$(curl -s -m 20 -w "\n%{http_code}" "$BASE/history" -H "Authorization: Bearer $KEY")
CODE=$(echo "$R" | tail -1)
[ "$CODE" = "200" ] && pass "history readable" || fail "history (HTTP $CODE)"

R=$(curl -s -m 20 -w "\n%{http_code}" "$BASE/balance" -H "Authorization: Bearer gpay_sk_wrongkey")
CODE=$(echo "$R" | tail -1)
[ "$CODE" = "401" ] && pass "wrong key rejected (401)" || fail "wrong key NOT rejected (HTTP $CODE)"

R=$(curl -s -m 20 -w "\n%{http_code}" -X POST "$BASE/pay" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"to":"0x0000000000000000000000000000000000000000","amount":0.001}')
CODE=$(echo "$R" | tail -1)
[ "$CODE" = "200" ] && pass "pay accepted (unlocked)" || echo "  INFO - pay blocked (locked by design: $(echo "$R" | head -1 | grep -oE '"[a-zA-Z ]+locked[^"]*"' | head -c 60))"
