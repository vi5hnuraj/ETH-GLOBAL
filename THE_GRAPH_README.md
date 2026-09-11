# GlobalPay × The Graph — Continuity Track Submission

**GlobalPay** is an autonomous AI-commerce platform where human-backed identity (World ID / AgentBook), access control (AgentKit), and payments (Arc / x402) meet **The Graph** as the evidence-based trust layer.

This repository is submitted to the **"Best AI Tooling or AI Use Case with The Graph (Continuity)"** prize at ETHGlobal.

---

## 🏆 Prize: Best AI Tooling / AI Use Case with The Graph — Continuity

- **Pool**: Continuity (extend existing open-source)
- **How we use The Graph**: The Graph is the **load-bearing source of trust data** — every provider trust score, every settlement-verified payment, and every recommendation reason is computed from settlement data indexed by our deployed Arc Subgraph.
- **AI tooling**: We ship an **MCP server** (`backend/mcp/graph-mcp-server.js`) exposing our Subgraph settlement data as reusable tools for any MCP client (Claude, Cursor, ChatGPT).

---

## What GlobalPay does with The Graph (live, not mocked)

The Graph is the single source of truth for who can be trusted in the marketplace. We use a custom GlobalPay Subgraph deployed to Subgraph Studio on **Arc Testnet**:

```text
Query URL   : https://api.studio.thegraph.com/query/1758639/globalpay-arc/version/latest
Deployment : QmPzoTATA5b9aYPCvDGMdD7Xe6uejX3nXiPXhEDLuRpCbu
Network     : Arc Testnet
```

Integration lives in:
- `backend/src/services/graphIntelligenceService.js` — Graph queries, trust scoring, verification, risk analysis, natural-language Trust Engine
- `backend/mcp/graph-mcp-server.js` — MCP tooling layer for AI environments

### Trust scoring from Graph data

For every provider wallet, GlobalPay computes trust **exclusively from indexed settlement data**:

| Metric | Source |
|---|---|
| Success rate | `successful / total` indexed payments |
| Customer diversity | unique payer addresses |
| Track record | count of successful settlements |
| Recency | time since last indexed settlement |
| Consistency | payments in the last 7 days |
| Risk flags | self-payments, cancellation streaks, volume spikes, failure dominance |

World ID / AgentBook sets an identity **floor** on top, but the score itself is Graph-derived.

---

## 🛠️ The Graph MCP Server (private product tooling)

A zero-dependency MCP server exposing GlobalPay's Subgraph data to any AI agent:

```bash
cd backend
GRAPH_QUERY_URL="https://api.studio.thegraph.com/query/1758639/globalpay-arc/version/latest" \
GRAPH_API_KEY="YOUR_KEY" \
GRAPH_DEPLOYMENT_ID="QmPzoTATA5b9aYPCvDGMdD7Xe6uejX3nXiPXhEDLuRpCbu" \
node mcp/graph-mcp-server.js
```

### Tools

| Tool | Description |
|---|---|
| `graph_status` | Subgraph sync status, indexed payment count, deployment ID |
| `analyze_provider` | Trust/risk analysis for a provider wallet |
| `ask_trust_engine` | Natural-language query over all indexed settlements ("Who is safest?") |

### Test it

```bash
curl http://localhost:8931/health
```
```json
{"status":"ok","provider":"The Graph","network":"Arc Testnet"}
```

```bash
curl -X POST http://localhost:8931/mcp/call -H 'content-type: application/json' \
  -d '{"tool":"ask_trust_engine","arguments":{"question":"Who is the safest provider?"}}'
```
```json
{
  "content": [{
    "type": "text",
    "text": "1. 0x144a...edafd16 — trust 88/100, 14 payments, 0.0014 USDC, risk low\n..."
  }]
}
```

---

## Where Graph is load-bearing in the platform

- **Recommendations** → providers scored by Graph settlement data
- **Purchase gating** → a purchase is blocked until Graph settlement is verified
- **Payment confirmation** → polls the Subgraph until the payment entity is indexed
- **Agent Passport** → trust score + continuity over Graph-indexed history
- **Dashboard** → live indexed block, payment count, sync status
- **AI Assistant** → natural-language Trust Engine over Subgraph data
- **Scheduler Worker** → reconciles payments against the Subgraph

---

## The Graph vs World ID (identity vs evidence)

| | World ID / AgentBook | The Graph |
|---|---|---|
| Proves | Identity ("this wallet is a real human") | Activity ("this wallet reliably settles payments") |
| Static/Dynamic | Static | Dynamic, grows with every payment |
| Example | human_backed: true | Trust 88/100 from 14 indexed settlements |

Both are distinct. World = who you are; The Graph = what you did.

---

## Pre-existing work (Continuity documentation)

This builds on GlobalPay's existing open-source project and extends it during the hackathon with:
1. A reusable **MCP server** exposing Subgraph settlement data to AI tooling.
2. Prominent live Graph status surfaces (Dashboard, Passport, Recommendations).
3. Graph-driven trust separated from identity in the UI.

---

## Run the whole platform

```bash
# Backend
cd backend && npm install && pm2 start src/server.js --name globalpay-backend

# Frontend
cd client && npm install && npm run dev
```

Requires `GRAPH_QUERY_URL`, `GRAPH_API_KEY`, `GRAPH_DEPLOYMENT_ID` for live Graph data.
