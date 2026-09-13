# 🏆 GlobalPay — ETHGlobal ETHOnline 2026 Submission

**Project**: GlobalPay — Trusted Commerce Infrastructure for Autonomous AI Agents  
**Track**: Continuity Track (extending existing open-source product)  
**Repository**: [GitHub Link]  
**Demo Video**: [Video Link — 2–4 minutes]

---

## 🎯 Elevator Pitch

> GlobalPay gives autonomous AI agents a trusted way to discover services, evaluate providers using on-chain evidence from The Graph, pay with USDC on Arc, and verify settlement automatically — all with human-backed identity through World ID.

---

## 🏅 Prize Submissions

### 1. 🤖 AgentKit Continuity — $3,500 (up to 3 teams × $1,166)

**How we use AgentKit:**

GlobalPay uses `@worldcoin/agentkit` for human-backed agent identity and authorization:

- **World ID verification** gates service and agent-listing publishing — only verified humans can sell
- **AgentBook registration** links specific agent wallets to verified humans via on-chain lookup
- **Publisher continuity** associates multiple AgentBook-registered wallets under one publisher profile
- **Access policy** gives AgentBook-linked wallets preferred x402 and service access
- **Agent Passport** combines identity, wallet registration, Graph evidence, and settlement history

**Key files:**
- `backend/src/services/worldAgentKitService.js` — AgentBook verifier, lookup, and verification
- `backend/src/services/agentBookRegistrationService.js` — wallet-specific registration flow
- `backend/src/middleware/agentKitGate.js` — publishing authorization middleware
- `client/src/pages/developer/DevWorldVerification.jsx` — World ID + AgentBook UI
- `WORLD_AGENTKIT_FEEDBACK.md` — integration feedback document

---

### 2. 📊 Best AI Tooling or AI Use Case with The Graph (Continuity) — $5,000

**How we use The Graph:**

The Graph is the **load-bearing trust layer** — not a decorative analytics page:

- **Custom Arc Subgraph** deployed via Subgraph Studio indexing all payment settlements
- **Trust Engine** computes provider trust scores exclusively from Graph-indexed settlement data
- **MCP Server** (`backend/mcp/graph-mcp-stdio.js`) exposes Graph intelligence as reusable tools for Claude, Cursor, ChatGPT
- **Autonomous Commerce** refuses to buy from providers without Graph settlement evidence
- **Settlement verification** waits for indexed Graph payment entity before confirming purchase

**Live subgraph:**
```text
Query URL   : https://api.studio.thegraph.com/query/1758639/globalpay-arc/version/latest
Deployment  : QmPzoTATA5b9aYPCvDGMdD7Xe6uejX3nXiPXhEDLuRpCbu
Network     : Arc Testnet
```

**Key files:**
- `backend/src/services/graphIntelligenceService.js` — Graph queries, trust scoring, verification
- `backend/mcp/graph-mcp-stdio.js` — MCP stdio server (standards-compliant)
- `client/src/pages/developer/DevGraphIntelligence.jsx` — Trust Engine UI
- `THE_GRAPH_README.md` — detailed Graph integration documentation

---

### 3. 🏆 Best DeFi or Agentic Application — $3,000

**How we use Arc and USDC:**

Arc is the settlement layer for the entire commerce operation:

- **Agent MPC wallets** hold and sign USDC transactions on Arc Testnet (chain `5042002`)
- **Native USDC** is both the gas and settlement token
- **Payment Manager** contract performs settlement (`settleInvoice` → `release`)
- **Spending policies** enforce budget, trust, and approval controls before payment
- **Autonomous agent-to-agent commerce** — agents discover, evaluate, pay, and verify services

**Real settlement transactions:**
```text
tx:  0xa1705e74edf3e435d2e2367fc1319f3514ff60b579ede2dcac121bfbeb194a5f
from: 0xF487090C702f7733C89669A756a61a090eceA988 (consumer agent)
to:   0xD25F8736C3Efc19a7cb7A3D15f2aF22c2980E317 (provider)
amt:  0.01 USDC · block 61218730 · status 1
```

**Key files:**
- `backend/src/services/arcService.js` — Arc RPC, wallet, balance
- `backend/src/services/commerceService.js` — prepaid settlement, invoice, credits
- `backend/src/services/agentDecisionEngine.js` — provider selection, policy enforcement
- `client/src/pages/developer/DevAutonomousCommerce.jsx` — autonomous flow UI

---

## 🏗 Architecture

```text
┌─────────────────────────────────────────────────┐
│  Human Identity                                  │
│  World ID / AgentBook → verified publisher       │
├─────────────────────────────────────────────────┤
│  Agent Infrastructure                            │
│  MPC wallets · API keys · spending policies      │
├─────────────────────────────────────────────────┤
│  Trust Intelligence                              │
│  The Graph subgraph → trust scores · risk flags  │
├─────────────────────────────────────────────────┤
│  Settlement                                      │
│  Arc USDC · Payment Manager · ArcScan receipts   │
├─────────────────────────────────────────────────┤
│  Commerce                                        │
│  Marketplace · Agent Store · Autonomous Commerce │
├─────────────────────────────────────────────────┤
│  AI Control                                      │
│  AI Operator · MCP Server · x402 · Workflows     │
└─────────────────────────────────────────────────┘
```

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TailwindCSS, TanStack Query |
| Backend | Node.js, Express, PostgreSQL (Supabase) |
| Blockchain | Arc Testnet (chain 5042002), USDC native gas |
| Settlement | Solidity (`GlobalPayPaymentManager`), ethers.js |
| Wallets | MPC threshold signing (3 local nodes) |
| Trust | The Graph subgraph (AssemblyScript), custom Trust Engine |
| Identity | World ID, AgentKit, AgentBook |
| AI | MCP stdio server, AI Operator, autonomous commerce pipeline |
| Payments | x402 HTTP payment protocol, prepaid settlement |

---

## 📁 Repository Structure

```text
├── backend/
│   ├── src/
│   │   ├── controllers/     # API route handlers
│   │   ├── services/        # Business logic
│   │   │   ├── arcService.js
│   │   │   ├── commerceService.js
│   │   │   ├── agentDecisionEngine.js
│   │   │   ├── graphIntelligenceService.js
│   │   │   ├── worldAgentKitService.js
│   │   │   └── ...
│   │   ├── middleware/       # Auth, validation, World gate
│   │   └── routes/          # Express routes
│   └── mcp/                 # MCP stdio server for Graph
├── client/
│   └── src/
│       ├── pages/developer/ # 60+ developer console pages
│       ├── components/      # UI components
│       └── utils/           # API clients
├── subgraph/                # The Graph subgraph schema
├── mpc-node/                # MPC wallet signing nodes
├── bazantic-recipes/        # Agent interop recipes
├── ARCHITECTURE.md
├── HACKATHON_SUBMISSION.md
├── THE_GRAPH_README.md
├── ARC_CIRCLE_README.md
├── WORLD_AGENTKIT_FEEDBACK.md
└── README.md
```

---

## 🎬 Demo Video (2–4 minutes)

**Core story:**

1. Dashboard overview → real platform, connected infrastructure
2. Organization + World ID verification → human-backed identity
3. Create agent + MPC wallet + API key → financially operational agent
4. Publish service → provider enters the economy
5. Marketplace discovery + Trust Engine → Graph-powered provider evaluation
6. Purchase + Arc USDC payment → real on-chain settlement
7. Agent Store → full agent marketplace (App Store for AI agents)
8. AI Assistant + Autonomous Commerce → natural language control
9. Billing + usage + Graph verification → complete transaction proof

**Key moment:** The Arc USDC payment — pause 3–5 seconds showing the transaction hash, amount, and confirmation before moving on.

---

## 🔗 Partner Resources

| Partner | Integration | Documentation |
|---|---|---|
| **Arc (Circle)** | USDC settlement, MPC wallets, Payment Manager | `ARC_CIRCLE_README.md` |
| **The Graph** | Custom subgraph, Trust Engine, MCP server | `THE_GRAPH_README.md` |
| **World ID / AgentKit** | Human verification, AgentBook, publishing gate | `WORLD_AGENTKIT_FEEDBACK.md` |
| **x402** | HTTP 402 payment protocol for API access | Built into service gateway |

---

## 📋 Pre-Existing vs New Work (Continuity Disclosure)

| Area | Pre-Existing Baseline | New Hackathon Work |
|---|---|---|
| **Agent Infrastructure** | Basic agent creation, wallets | MPC wallets, AgentBook registration, multi-wallet continuity |
| **Trust** | No on-chain trust | Graph Trust Engine, provider scoring, risk analysis, MCP server |
| **Commerce** | Manual marketplace | Autonomous commerce, AI recommendations, policy enforcement |
| **Identity** | Basic auth | World ID gate, AgentBook verification, publisher passports |
| **Settlement** | Mock payments | Arc USDC settlement, Payment Manager, Graph verification |
| **AI Control** | None | AI Operator, natural-language queries, execution traces |
| **Interoperability** | None | MCP server, x402 protocol, Bazantic recipes |

---

## 🚀 Running the Project

```bash
# Backend (port 5550)
cd backend && npm install && NODE_ENV=staging node server.js

# Frontend (port 5173)
cd client && npm install && npm run dev

# MCP Server (port 8931)
cd backend && node mcp/graph-mcp-stdio.js
```

**Required environment variables:**
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ARC_RPC_URL`, `GLOBAL_PAY_MANAGER_ADDRESS`, `GRAPH_API_KEY`, `GRAPH_QUERY_URL`, `MPC_SERVICE_TOKEN`, `WORLD_API_KEY`, `ENCRYPTION_KEY`

---

## ✅ Submission Checklist

- [x] GitHub repository with clean commit history (86 commits, single author)
- [x] Architecture documentation (`ARCHITECTURE.md`)
- [x] Partner-specific READMEs (Arc/Circle, The Graph, World AgentKit)
- [x] Working demo video (2–4 minutes)
- [x] World AgentKit feedback document
- [x] MCP server for Graph intelligence
- [x] Real Arc USDC settlement transactions
- [x] Live Graph subgraph with indexed payments
- [x] No secrets, API keys, or credentials in repository

---

**GlobalPay — Trusted commerce infrastructure for autonomous AI agents.**
