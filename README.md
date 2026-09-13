# 🏆 GlobalPay

### Trusted Commerce Infrastructure for Autonomous AI Agents

> **AI agents can make decisions. But can they safely transact with unknown services?**
>
> GlobalPay solves this. It gives agents a trusted way to discover services, evaluate providers using real on-chain evidence, pay with USDC on Arc, and verify that every transaction actually happened.

**ETHGlobal ETHOnline 2026 · Continuity Track**

---

## 🎯 The Problem

AI agents are becoming capable of performing tasks autonomously. But they face one critical gap:

```
Agent needs a service
        ↓
Unknown provider — can I trust them?
        ↓
No verifiable payment history
        ↓
No identity — is this a real person?
        ↓
No way to pay programmatically
        ↓
No proof the service was delivered
```

**Traditional marketplaces show ratings and reviews. AI agents can't read reviews. They need programmatic, verifiable trust signals.**

---

## 💡 The Solution

GlobalPay is a **two-sided agent economy** where:

| Role | What They Do |
|---|---|
| **Providers** | Publish AI services with USDC pricing |
| **Consumers** | Discover, evaluate, and purchase services autonomously |
| **The Graph** | Provides verifiable trust evidence from real on-chain settlements |
| **Arc + USDC** | Handles payment settlement with native stablecoin |
| **World ID** | Verifies the human behind every organization |
| **AI Operator** | Enables natural-language control and autonomous commerce |

### The Golden Path

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

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────┐
│  🛡  Human Identity                                      │
│  World ID / AgentBook → verified publisher               │
├─────────────────────────────────────────────────────────┤
│  🤖 Agent Infrastructure                                 │
│  MPC wallets · API keys · spending policies              │
├─────────────────────────────────────────────────────────┤
│  📊 Trust Intelligence                                   │
│  The Graph subgraph → trust scores · risk flags          │
├─────────────────────────────────────────────────────────┤
│  💵 Settlement                                           │
│  Arc USDC · Payment Manager · ArcScan receipts           │
├─────────────────────────────────────────────────────────┤
│  🏪 Commerce                                             │
│  Marketplace · Agent Store · Autonomous Commerce         │
├─────────────────────────────────────────────────────────┤
│  🧠 AI Control                                           │
│  AI Operator · MCP Server · x402 · Workflows             │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Product Walkthrough

### Step 1 — Organization + Identity

Every participant operates through an organization. GlobalPay verifies the human using **World ID**, establishing that the platform is operated by a real, unique human.

```
Organization created
        ↓
World ID verification → human-backed identity confirmed ✅
        ↓
AgentBook registration → wallet linked to verified human
```

> World ID verifies the human-backed identity, while on-chain activity is used separately to evaluate settlement reliability.

---

### Step 2 — Create Agent + MPC Wallet

An agent is not a chatbot. It's a **financially operational entity** with its own wallet:

```
Developer API Key → Agent Studio → Create Agent
        ↓
MPC wallet minted (e.g. 0xF48709…EA988)
Agent API key generated
        ↓
Agent can now: hold funds, access services, perform transactions
```

| Feature | Detail |
|---|---|
| Wallet type | MPC threshold-signed (3 local signing nodes) |
| Native asset | USDC (gas + settlement) |
| Network | Arc Testnet (chain 5042002) |
| API access | Scoped agent API key |

---

### Step 3 — Publish a Service

An agent becomes a service provider:

```
Service: Market Intelligence API
Pricing: 0.01 USDC per request
Category: Analytics / Finance
API Endpoint: https://api.globalpay.ai/services/market-intelligence/invoke
```

Optional **x402** enables pay-per-call API access — agents pay automatically per request without pre-purchasing.

---

### Step 4 — Marketplace Discovery

The marketplace is where consumers find services. Each listing shows:

- ✅ Provider name and wallet address
- ✅ Service capability and description
- ✅ Price and pricing unit
- ✅ **Human-backed badge** (World ID verified)
- ✅ **Trust score** (powered by The Graph)
- ✅ **Arc settlement history**

---

### Step 5 — Trust Engine (The Graph) ⭐

**This is the core differentiator.** Before purchasing, consumers inspect provider evidence powered by The Graph:

| Evidence | What It Means |
|---|---|
| **Trust Score: 88/100** | Computed from payment success, volume, buyer diversity, recency |
| **Success: 100% (22/22)** | 22 of 22 indexed payments released successfully |
| **Volume: 0.0022 USDC** | Real on-chain settlement — not self-reported |
| **Unique Buyers: 14** | How many different wallets paid this provider |
| **Repeat Buyers: 2** | Do buyers come back? Repeat = higher trust |
| **Risk: Low** | No fraud signals detected |
| **Source: The Graph · Arc Testnet** | Live from the subgraph, not from a database |

```
Without The Graph:
Provider says: "I'm trusted, 100% success rate"
Agent has no way to verify → blind trust → potential fraud

With The Graph:
GlobalPay queries the subgraph → sees 22 real settlements
Agent verifies independently → trust is earned, not claimed
```

> **Trust Engine** answers: *"Who can I trust?"*
> **AI Recommendations** answers: *"Who should I buy from?"*

---

### Step 6 — Purchase + Arc USDC Payment ⭐

The most important moment — a real on-chain payment:

```
Selected Service → Price → Consumer Agent
        ↓
Payment Confirmation
        ↓
Arc USDC Transaction (on-chain) ✅
        ↓
Transaction Hash: 0xa1705e74…
        ↓
Graph Verification → Settlement confirmed
        ↓
Credits/Access Granted → Invoice Created
```

**Live settlement transaction:**
```
tx      0xa1705e74edf3e435d2e2367fc1319f3514ff60b579ede2dcac121bfbeb194a5f
block   61218730 · status 1
from    0xF487090C702f7733C89669A756a61a090eceA988 (consumer agent)
to      0xD25F8736C3Efc19a7cb7A3D15f2aF22c2980E317 (provider)
amount  0.01 USDC
```

---

### Step 7 — Agent Store (App Store for AI Agents)

GlobalPay supports a full agent marketplace:

| Feature | Detail |
|---|---|
| **Publishers** | Release versioned agents with pricing, docs, support |
| **Consumers** | Browse, install, subscribe, invoke, manage agents |
| **Installed Agents** | Status, version, subscription, invocation controls |

> Services are individual capabilities. Agents are complete installable products with lifecycle, versions, permissions, and subscriptions.

---

### Step 8 — AI Assistant + Autonomous Commerce

The **AI Operator** provides natural-language control:

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

**Autonomous Commerce** combines everything into a programmable loop:
**Discover → Evaluate → Apply Policy → Pay → Invoke → Verify → Record**

> The agent acts within configured permissions, budgets, and approval policies — autonomy without losing control.

---

## 🔗 Partner Integrations

| Layer | Partner | Role | Status |
|---|---|---|---|
| 💵 Settlement | **Arc L1** | MPC wallets, USDC-native settlement, Payment Manager | ✅ Live |
| 🤖 Machine payments | **x402** | HTTP 402 protocol — agents pay per API call | ✅ Live |
| 📊 Trust | **The Graph** | Custom subgraph indexing Arc settlements | ✅ Live |
| 🛡 Identity | **World ID / AgentKit** | Human verification, AgentBook registration | ✅ Live |

---

## 📊 Live System Proof

### Graph Subgraph Status

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

### x402 Protocol (executed 3 times)

| # | Arc tx | Result |
|---|---|---|
| 1 | `0x288445d1…` | 402 → pay → **200** live Graph data |
| 2 | `0xae7f52e7…` | 402 → pay → **200** trust analysis |
| 3 | `0xa1705e74…` | 402 → pay → gate passed; replay → **409 rejected** |

### World ID Gate

```
POST /api/developers/services → 403 "World AgentKit verification required"
```

---

## 🛠 Tech Stack

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

## 🚀 Getting Started

```bash
# Backend (port 5550)
cd backend && npm install && NODE_ENV=staging node server.js

# Frontend (port 5173)
cd client && npm install && npm run dev
```

**Required environment variables:**
`SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `ARC_RPC_URL` · `GLOBAL_PAY_MANAGER_ADDRESS` · `GRAPH_API_KEY` · `GRAPH_QUERY_URL` · `MPC_SERVICE_TOKEN` · `WORLD_API_KEY` · `ENCRYPTION_KEY`

---

## 📚 Documentation

| Document | Description |
|---|---|
| [HACKATHON_SUBMISSION.md](./HACKATHON_SUBMISSION.md) | Complete submission with all 3 prize tracks |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture and payment sequence |
| [ARC_CIRCLE_README.md](./ARC_CIRCLE_README.md) | Arc/Circle integration details |
| [THE_GRAPH_README.md](./THE_GRAPH_README.md) | The Graph integration and MCP server |
| [WORLD_AGENTKIT_FEEDBACK.md](./WORLD_AGENTKIT_FEEDBACK.md) | World AgentKit feedback document |

---

## 🎯 What Judges Should Remember

1. **Agents have financial identity** — wallets, balances, credentials, permissions
2. **Agents can participate in a service economy** — one agent publishes, another purchases
3. **Payments are real and verifiable** — USDC on Arc with on-chain evidence
4. **Trust and autonomy are integrated** — evaluate → policy → pay → verify → record

---

> **GlobalPay turns agents from software that only produces outputs into economic participants that can discover, transact, and operate within controlled financial policies.**
