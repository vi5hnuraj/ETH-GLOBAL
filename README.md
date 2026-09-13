# GlobalPay — Trusted Commerce Infrastructure for Autonomous AI Agents

**ETHGlobal ETHOnline 2026 · Continuity Track**

> GlobalPay gives autonomous AI agents a trusted way to discover services, evaluate providers using on-chain evidence from The Graph, pay with USDC on Arc, and verify settlement automatically.

```
Organization + World ID verification
        ↓
Create Agent + MPC Wallet + API Key
        ↓
Publish Service (with USDC pricing)
        ↓
Consumer discovers service in Marketplace
        ↓
Trust Engine evaluates provider via The Graph
        ↓
Agent pays with USDC on Arc
        ↓
Settlement verified on-chain
        ↓
Service invoked · Usage recorded · Reputation updated
```

---

## What GlobalPay Is

GlobalPay is a **two-sided agent economy** where:

- **Providers** publish AI services (OCR, GPU inference, market intelligence, translation, etc.)
- **Consumers** discover, evaluate, and purchase those services
- **The Graph** provides verifiable trust evidence from real on-chain settlements
- **Arc + USDC** handles payment settlement with native stablecoin
- **World ID / AgentBook** provides human-backed identity verification
- **AI Operator** enables natural-language control and autonomous commerce

One agent can publish a service. Another agent can discover it, check if the provider is trustworthy, pay with USDC, use the service, and record the entire transaction — all without human intervention.

---

## The Complete Product Flow

### Step 1: Organization + Identity Verification

Every participant operates through an organization. GlobalPay verifies the human behind the organization using World ID, establishing that the platform is operated by a real, unique human without exposing personal information.

```
Organization created
        ↓
World ID verification → human-backed identity confirmed
        ↓
AgentBook registration → specific wallet linked to verified human
```

World ID verifies the human-backed identity, while on-chain activity is used separately to evaluate settlement reliability. Verification is completed once and supports all agents created under this organization.

### Step 2: Create Agent + MPC Wallet + API Key

Before an agent can transact, it needs infrastructure:

1. **Developer API Key** — authenticates the developer for management operations
2. **Agent Studio** — creates an agent with a managed MPC wallet
3. **MPC Wallet** — blockchain address + USDC balance on Arc Testnet
4. **Agent API Key** — allows the agent to authenticate and access services

```
Developer API Key → Agent Studio → Create Agent
        ↓
MPC wallet minted (e.g. 0xF48709…EA988)
Agent API key generated (gp_ai_...)
        ↓
Agent is now a financially operational entity
```

The agent is not just a chatbot identity — it has a programmable financial identity that can hold funds, access services, and perform authorized transactions.

### Step 3: Publish a Service

An agent can become a service provider. Publishing a service makes it discoverable in the marketplace:

```
Service: Market Intelligence API
Description: Provides structured market insights
Pricing: 0.01 USDC per request
Category: Analytics / Finance
API Endpoint: https://api.globalpay.ai/services/market-intelligence/invoke
```

Optional **x402** setting enables pay-per-call API access — agents can pay automatically for individual API requests without pre-purchasing.

### Step 4: Marketplace Discovery

The marketplace is where consumers find services. Each listing shows:

- Provider name and wallet address
- Service capability and description
- Price and pricing unit
- **Human-backed badge** (World ID verified)
- **Trust score** (powered by The Graph)
- **Arc settlement history**

### Step 5: Trust Engine Evaluation (The Graph)

Before purchasing, consumers can inspect provider evidence. The Trust Engine is powered by **The Graph** — our custom subgraph indexes payment settlements from Arc Testnet:

| Evidence | What It Means |
|---|---|
| **Trust Score: 88/100** | Computed from payment success, volume, buyer diversity, recency |
| **Success: 100% (22/22)** | 22 of 22 indexed payments released successfully |
| **Volume: 0.0022 USDC** | Real on-chain settlement volume — not self-reported |
| **Unique Buyers: 14** | How many different wallets have paid this provider |
| **Repeat Buyers: 2** | Do buyers come back? Repeat = higher trust |
| **Risk: Low** | No fraud signals detected |
| **Source: The Graph · Arc Testnet** | Live from the subgraph, not from a database |

Instead of relying on self-reported ratings, agents evaluate providers using actual blockchain settlement evidence.

**The Trust Engine** answers: *"Who can I trust?"*  
**AI Recommendations** answers: *"Who should I buy from?"*

### Step 6: Purchase + Arc USDC Payment

The consumer creates a purchase session and pays with USDC on Arc:

```
Selected Service → Price → Consumer Agent
        ↓
Payment Confirmation
        ↓
Arc USDC Transaction (on-chain)
        ↓
Transaction Hash: 0xa1705e74…
        ↓
Graph Verification → Settlement confirmed
        ↓
Credits/Access Granted → Invoice Created
```

The payment is settled through the GlobalPay Payment Manager contract and can be verified on ArcScan.

### Step 7: Agent Store (App Store for AI Agents)

GlobalPay supports a full agent marketplace, similar to an App Store:

- **Publishers** release versioned agents with pricing, documentation, and support
- **Consumers** browse, install, subscribe, invoke, and manage agents
- **Installed Agents** show status, version, subscription, and invocation controls

> Services are individual capabilities that can be purchased. Agents are complete installable products with their own lifecycle, versions, permissions, and subscriptions.

### Step 8: AI Assistant + Autonomous Commerce

The **AI Operator** provides natural-language control over the entire infrastructure:

```
"Find the safest OCR provider and purchase one credit"
        ↓
Intent recognition → Provider discovery
        ↓
Trust Engine evaluation → Graph evidence
        ↓
Policy check → Budget and approval controls
        ↓
Provider selected → Purchase prepared
        ↓
Arc USDC payment → Settlement verified
        ↓
Result returned → Usage recorded
```

**Autonomous Commerce** combines these capabilities into a programmable execution loop: discover → evaluate → apply policy → pay → invoke → verify → record.

The agent acts within configured permissions, budgets, and approval policies — autonomy without losing control.

---

## Architecture

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

## Partner Integrations

| Layer | Partner | Role | Status |
|---|---|---|---|
| 💵 Settlement | **Arc L1** | MPC wallets, USDC-native settlement, Payment Manager | ✅ Live (chainId 5042002) |
| 🤖 Machine payments | **x402** | HTTP 402 protocol — agents pay per API call | ✅ Live |
| 📊 Trust | **The Graph** | Custom subgraph indexing Arc settlements → trust scores | ✅ Live subgraph |
| 🛡 Identity | **World ID / AgentKit** | Human verification, AgentBook wallet registration | ✅ Enforced in routes |

---

## Verified Proof

### Real Arc Settlement Transaction

```
tx      0xa1705e74edf3e435d2e2367fc1319f3514ff60b579ede2dcac121bfbeb194a5f
block   61218730 · status 1
from    0xF487090C702f7733C89669A756a61a090eceA988 (consumer agent)
to      0xD25F8736C3Efc19a7cb7A3D15f2aF22c2980E317 (provider)
amount  0.01 USDC
```

### Live Graph Subgraph

```json
{
  "indexedBlock": 61237228,
  "headBlock": 61237237,
  "lagBlocks": 9,
  "paymentCount": 16,
  "settlementCount": 16,
  "graphLive": true
}
```

### x402 Payment Protocol (executed 3 times)

| # | Arc tx | Result |
|---|---|---|
| 1 | `0x288445d1…` | 402 → pay → **200** live Graph data |
| 2 | `0xae7f52e7…` | 402 → pay → **200** trust analysis |
| 3 | `0xa1705e74…` | 402 → pay → gate passed; replay → **409 rejected** |

### World ID Publishing Gate

```
POST /api/developers/services → 403 "World AgentKit verification required"
```

---

## What's Built

**60+ Developer Console Pages**: organizations, profiles, API keys, webhooks, playground, x402, Trust Engine, Autonomous Commerce, AI Assistant, Agent Store, billing, analytics

**Agent Runtime**: create/suspend/rotate/delete agents, MPC wallets, balance checks, payments, history, usage metering, invoices, reputation

**Marketplace**: service publishing (metered pricing, x402 flag), agent store with versions/reviews, installations, revenue dashboards

**Trust Infrastructure**: Graph-backed trust scores, risk flags, explainable recommendations, provider leaderboards, MCP server for AI environments

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TailwindCSS, TanStack Query |
| Backend | Node.js, Express, PostgreSQL (Supabase) |
| Blockchain | Arc Testnet (chain 5042002), USDC native gas |
| Settlement | Solidity (`GlobalPayPaymentManager`), ethers.js |
| Wallets | MPC threshold signing (3 local nodes) |
| Trust | The Graph subgraph, custom Trust Engine |
| Identity | World ID, AgentKit, AgentBook |
| AI | MCP stdio server, AI Operator, autonomous commerce |
| Payments | x402 HTTP payment protocol, prepaid settlement |

---

## Running

```bash
# Backend (port 5550)
cd backend && npm install && NODE_ENV=staging node server.js

# Frontend (port 5173)
cd client && npm install && npm run dev
```

Required env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ARC_RPC_URL`, `GLOBAL_PAY_MANAGER_ADDRESS`, `GRAPH_API_KEY`, `GRAPH_QUERY_URL`, `MPC_SERVICE_TOKEN`, `WORLD_API_KEY`, `ENCRYPTION_KEY`

---

## Documentation

| Document | Description |
|---|---|
| [HACKATHON_SUBMISSION.md](./HACKATHON_SUBMISSION.md) | Complete submission with all 3 prize tracks |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture and payment sequence |
| [ARC_CIRCLE_README.md](./ARC_CIRCLE_README.md) | Arc/Circle integration details |
| [THE_GRAPH_README.md](./THE_GRAPH_README.md) | The Graph integration and MCP server |
| [WORLD_AGENTKIT_FEEDBACK.md](./WORLD_AGENTKIT_FEEDBACK.md) | World AgentKit feedback document |

---

**GlobalPay turns agents from software that only produces outputs into economic participants that can discover, transact, and operate within controlled financial policies.**
