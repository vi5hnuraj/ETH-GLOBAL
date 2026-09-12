# GlobalPay × The Graph — Continuity Track Submission

**GlobalPay** is an autonomous AI-commerce platform where human-backed identity (World ID / AgentBook), access control (AgentKit), and payments (Arc / x402) meet **The Graph** as the evidence-based trust layer.

This repository is submitted to the **"Best AI Tooling or AI Use Case with The Graph (Continuity)"** prize at ETHGlobal.

### Eligibility Statement

GlobalPay belongs in the **Continuity** pool: it is an existing open-source AI-commerce product extended with a new, reusable Graph intelligence and MCP tooling layer during the hackathon. The Graph is not a decorative analytics page or a secondary reputation lookup. It is part of the platform's decision, authorization, settlement, verification, and AI execution loop.

---

## 🏆 Prize: Best AI Tooling / AI Use Case with The Graph — Continuity

- **Pool**: Continuity (extend existing open-source)
- **How we use The Graph**: The Graph is the **load-bearing source of trust data** — every provider trust score, every settlement-verified payment, and every recommendation reason is computed from settlement data indexed by our deployed Arc Subgraph.
- **AI tooling**: We ship a standards-compliant **MCP stdio server** (`backend/mcp/graph-mcp-stdio.js`) exposing our Subgraph settlement data as reusable tools for Claude, Cursor, ChatGPT-compatible clients, and other MCP environments. A separate HTTP adapter remains available for browser and integration testing.

---

## What GlobalPay does with The Graph (live, not mocked)

The Graph is the single source of truth for who can be trusted in the marketplace. We use a custom GlobalPay Subgraph deployed to Subgraph Studio on **Arc Testnet**:

```text
Query URL   : https://api.studio.thegraph.com/query/1758639/globalpay-arc/version/latest
Deployment : QmPzoTATA5b9aYPCvDGMdD7Xe6uejX3nXiPXhEDLuRpCbu
Network     : Arc Testnet
```

The live Graph data is used across the complete product lifecycle:

```text
Arc settlement events
        ↓
GlobalPay Arc Subgraph
        ↓
Trust Engine + MCP tools
        ↓
Provider discovery and risk reasoning
        ↓
Purchase policy decision
        ↓
Prepaid Arc payment
        ↓
Graph settlement verification
        ↓
Agent reputation and publisher continuity
```

Integration lives in:
- `backend/src/services/graphIntelligenceService.js` — Graph queries, trust scoring, verification, risk analysis, natural-language Trust Engine
- `backend/mcp/graph-mcp-server.js` — MCP tooling layer for AI environments

The deployed Subgraph currently contains live Arc payment, settlement, and invoice-reference entities. The application compares the indexed block with the live Arc head and exposes sync lag instead of pretending that indexing is instantaneous.

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

### Graph data used beyond reputation

The Graph participates in all of these decisions and product surfaces:

| Product surface | How live Graph data is used |
|---|---|
| Trust Engine | Answers natural-language questions about safest, riskiest, most active, and highest-volume providers |
| Marketplace Recommendations | Ranks services using settlement reliability, volume, buyer diversity, recency, and risk |
| Autonomous Commerce | Chooses a provider from Graph evidence before an agent spends USDC |
| Procurement Policy | Blocks or allows a provider decision when trust/risk requirements are not satisfied |
| Payment Confirmation | Waits for the indexed Graph payment entity before marking a prepaid purchase complete |
| Agent Passport | Displays auditable Graph settlement history and publisher-level continuity |
| Dashboard | Shows indexed block, Arc head, sync lag, payment count, settlement count, and invoice references |
| AI Operator | Converts Graph-derived provider intelligence into structured natural-language answers and execution traces |
| MCP Server | Makes the same Graph intelligence reusable from external AI clients |
| Reconciliation Workers | Uses indexed payment entities to reconcile settlement state and avoid false completion |

This means a Graph outage or missing indexed settlement deliberately reduces functionality: GlobalPay will not claim trust, approve a trust-based purchase, or call a payment verified when the evidence is unavailable.

---

## 🛠️ The Graph MCP Server (reusable open-source tooling)

The official `@modelcontextprotocol/sdk` powers a standards-compliant MCP stdio server. It is intentionally separate from the dashboard so the same Graph intelligence can be used by Claude, Cursor, ChatGPT-compatible clients, internal agents, or other applications. The repository also retains a small HTTP adapter at `backend/mcp/graph-mcp-server.js` for local health checks and integration testing.

```bash
cd backend
GRAPH_QUERY_URL="https://api.studio.thegraph.com/query/1758639/globalpay-arc/version/latest" \
GRAPH_API_KEY="YOUR_KEY" \
GRAPH_DEPLOYMENT_ID="QmPzoTATA5b9aYPCvDGMdD7Xe6uejX3nXiPXhEDLuRpCbu" \
node mcp/graph-mcp-stdio.js
```

### Tools

| Tool | Description |
|---|---|
| `graph_status` | Subgraph sync status, indexed payment count, deployment ID |
| `analyze_provider` | Trust/risk analysis for a provider wallet |
| `ask_trust_engine` | Natural-language query over all indexed settlements ("Who is safest?") |

The tools return Graph-derived facts and reasoning, not a static provider catalog. `analyze_provider` returns settlement counts, success rate, volume, buyer diversity, recency, risk flags, and trust score. `ask_trust_engine` ranks providers from the live indexed snapshot and explains the distinction between earnings and reliability.

### Test it

```bash
curl http://localhost:8931/health
```
```json
{"status":"ok","provider":"The Graph","network":"Arc Testnet"}
```

Verify the live deployment through the GlobalPay API:

```bash
curl http://localhost:5550/api/developers/graph/status \
  -H 'X-Developer-Id: your-developer-id'
```

The response reports `graphLive`, `indexedBlock`, `headBlock`, `lagBlocks`, `paymentCount`, `settlementCount`, and `invoiceReferenceCount`. A nonzero sync lag is reported honestly while indexing catches up.

```bash
curl -X POST http://localhost:8931/mcp/call -H 'content-type: application/json' \
  -d '{"tool":"ask_trust_engine","arguments":{"question":"Who is the safest provider?"}}'
```

The stdio server was validated with the MCP `initialize` handshake and advertises the standard `tools` capability.
```json
{
  "content": [{
    "type": "text",
    "text": "1. 0x144a...edafd16 — trust 88/100, 14 payments, 0.0014 USDC, risk low\n..."
  }]
}
```

---

## Full Product Engagement With The Graph

- **Discovery** → the Trust Engine turns a natural-language goal into a ranked provider set.
- **Reasoning** → the AI compares reliability, volume, buyer diversity, recency, and risk rather than simply selecting the highest earner.
- **Decision** → Autonomous Commerce selects a provider only after Graph evidence is available.
- **Policy** → procurement rules can require minimum trust or reject risky providers before payment.
- **Execution** → the selected service is paid through the existing prepaid Arc settlement path.
- **Verification** → the payment is not treated as fully confirmed until the corresponding Graph entity is indexed.
- **Reputation** → new payments change provider evidence and future rankings.
- **Continuity** → AgentBook-linked wallets can be associated with one publisher while their economic history is aggregated from Graph settlements.
- **Auditability** → transaction hashes, indexed blocks, payment statuses, and Graph entity IDs remain inspectable.
- **AI interoperability** → the MCP server exposes these capabilities outside the GlobalPay UI.

---

## The Graph vs World ID (identity vs evidence)

| | World ID / AgentBook | The Graph |
|---|---|---|
| Proves | Identity ("this wallet is a real human") | Activity ("this wallet reliably settles payments") |
| Static/Dynamic | Static | Dynamic, grows with every payment |
| Example | human_backed: true | Trust 88/100 from 14 indexed settlements |

Both are distinct. World = who you are; The Graph = what you did.

---

## Pre-existing Work and Hackathon Work (Continuity Documentation)

### Pre-existing product

GlobalPay already provided the AI-agent, Marketplace, wallet, Arc payment, World identity, and developer workspace foundations.

### Work shipped for this Continuity extension

1. A reusable **Graph MCP server** for AI environments.
2. Expanded Graph-backed provider intelligence and risk reasoning.
3. Natural-language Trust Engine queries.
4. Graph-powered provider recommendations and autonomous provider selection.
5. Settlement verification before purchase completion.
6. Live Graph status surfaces on Dashboard, Passport, Recommendations, and Trust Engine.
7. A visual Graph Evidence Map and auditable settlement rows.
8. Clear separation between World identity evidence and Graph economic evidence.
9. Documentation and reproducible MCP examples for judges.

Only the extension work above should be presented as the hackathon contribution; the pre-existing platform should be disclosed as continuity context.

### Public repository checklist

The public submitted repository must include:

- `backend/src/services/graphIntelligenceService.js`
- `backend/mcp/graph-mcp-server.js`
- `client/src/pages/developer/DevGraphIntelligence.jsx`
- `client/src/pages/developer/DevAutonomousCommerce.jsx`
- `client/src/pages/developer/DevAiAssistant.jsx`
- `THE_GRAPH_README.md`

Never commit `.env`, API keys, private keys, wallet secrets, or database credentials.

World/AgentKit continuity feedback and Sandbox test guidance are documented in [`WORLD_AGENTKIT_FEEDBACK.md`](./WORLD_AGENTKIT_FEEDBACK.md).

---

## Run the whole platform

```bash
# Backend
cd backend && npm install && pm2 start src/server.js --name globalpay-backend

# Frontend
cd client && npm install && npm run dev
```

Requires `GRAPH_QUERY_URL`, `GRAPH_API_KEY`, `GRAPH_DEPLOYMENT_ID` for live Graph data.

## Judge Demo Script

Use a funded Arc Testnet consumer wallet and a reachable Marketplace service.

1. Open `/developer/graph-intelligence` and show `Graph Live`, indexed block, payment count, settlement count, and sync lag.
2. Ask: `Who is the safest provider?`
3. Show the provider trust chart, success rate, buyer diversity, risk level, and recent settlement evidence.
4. Ask: `Who earned the most USDC this week?`
5. Show that the highest earner and safest provider can be different, demonstrating real reasoning rather than volume sorting.
6. Open `/developer/commerce/autonomous` and enter: `Find the safest OCR provider and purchase one credit.`
7. Show Graph analysis, policy check, Arc settlement, and Graph verification.
8. Open `/developer/agent-profile` and show the same provider's Graph evidence and transaction history.
9. Optionally call the MCP endpoint and ask: `Who is the safest provider?`

The demo must distinguish these honest states:

- `Payment settled · Graph verification pending`: Arc payment exists but indexing is not complete.
- `Payment settled · Graph verified`: the settlement is indexed and verified.
- `Payment blocked`: policy, balance, provider health, or Graph evidence prevented payment.

Do not claim service execution when the flow only reserved prepaid credits; use `Payment completed · Credit reserved` until the provider invocation succeeds.
