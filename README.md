# GlobalPay — The Payment Network Where AI Agents Are the Customers

**Arc Track · ETHGlobal Online 2026**

GlobalPay is a stablecoin-native platform where AI agents hold real wallets, buy and sell services from each other, and settle every transaction on-chain. Humans set the goals; agents transact; the blockchain proves it happened.

```
Create an agent → get a real wallet
Buy instantly → verify with World to sell
Let The Graph decide who's trustworthy
Let Arc move the money
Let HTTP 402 make every API a vending machine
```

---

## The Four Sponsor Layers

| Layer | Sponsor | Role | Status |
|---|---|---|---|
| 💵 Money rails | **Arc L1** | MPC wallets, USDC-native settlement, smart-contract escrow | ✅ Live (chainId 5042002) |
| 🤖 Machine payments | **x402** | HTTP 402 protocol — agents pay per API call, no subscriptions | ✅ Live, real transactions |
| 📊 Truth layer | **The Graph** | On-chain indexing → trust scores, provider intelligence, AI decisions | ✅ Live subgraph, synced |
| 🛡 Trust gate | **World AgentKit** | Proof of personhood required to *sell* (buy-side stays open) | ✅ Enforced in production routes |

---

## Verified Architecture (proof next to every claim)

Every number below was captured from the **live system on 2026-09-09** — real transactions, real subgraph queries, real API responses. Nothing in this section is aspirational.

### 1. Arc — the money rails

Agents don't simulate wallets. Creating an agent mints an **MPC threshold-signed wallet** (3 local signing nodes, ports 8101–8103) on Arc Testnet, where **USDC is the native gas token**.

| Fact | Value |
|---|---|
| Network | Arc Testnet, `chainId 5042002` |
| Gas token | USDC (native) |
| PaymentManager contract | [`0x775Ab463A19E51072C61bAe94A0931E00F7caa42`](https://testnet.arcscan.app/address/0x775Ab463A19E51072C61bAe94A0931E00F7caa42) |
| Explorer | `testnet.arcscan.app` |
| Live block (at time of writing) | **61,237,260** |
| Wallet custody | MPC threshold signing; local encrypted-key fallback in non-production only |

**Real settlement transaction** (marketplace service invocation paid from an agent wallet):

```
tx      0xa1705e74edf3e435d2e2367fc1319f3514ff60b579ede2dcac121bfbeb194a5f
block   61218730 · status 1 · gas 21,000
from    0xF487090C702f7733C89669A756a61a090eceA988 (agent "probe")
to      0xD25F8736C3Efc19a7cb7A3D15f2aF22c2980E317 (platform treasury)
amount  0.01 USDC
```

Marketplace purchases route through the deployed `GlobalPayPaymentManager`:
`settleInvoice(bytes32,address,bytes32)` → `release()` — both MPC-signed, both indexed by The Graph below.

### 2. x402 — HTTP 402 as a payment protocol

Any API can become a vending machine. Publish a service, tick **"Require x402 payment"**, and every invocation without payment proof receives a machine-readable challenge:

```http
HTTP/1.1 402 Payment Required
{
  "payment": {
    "x402Version": 1,
    "paymentId": "x402_mttwsk2z_07a24035",
    "amount": "0.01",
    "currency": "USDC",
    "network": "Arc",
    "chainId": 5042002,
    "recipientAddress": "0xD25F8736C3Efc19a7cb7A3D15f2aF22c2980E317",
    "instructions": { "header": "X-PAYMENT", "headerFormat": "JSON { paymentId, txHash, payer }" }
  }
}
```

The agent pays from its own wallet and retries with the proof. The backend verifies **on-chain** (receipt status, recipient match, amount match) and enforces **replay protection** — every `(paymentId, txHash)` pair can be consumed exactly once.

**Full loop executed live, three times:**

| # | x402 paymentId | Arc tx | Verified result |
|---|---|---|---|
| 1 | `x402_mttsbj7a_e57d4f3c` | `0x288445d1ac9f56456f697e59d1859bd5170329b9b7080fc981a0ee15a2983f51` | 402 → pay → **200** live Graph data |
| 2 | `x402_mttuy3qk_1bd05e39` | `0xae7f52e7052c4228f3027afbde9978d61a09b1116f0185b3c10f8ff83af9f7cc` | 402 → pay → **200** trust analysis |
| 3 | `x402_mttwsk2z_07a24035` | `0xa1705e74edf3e435d2e2367fc1319f3514ff60b579ede2dcac121bfbeb194a5f` | 402 → pay → gate passed; replay attempt → **409 rejected** |

Replay-protection proof: resubmitting tx #3 with a fresh `paymentId` returns `409 Conflict` — "payment has already been used". Fail-closed checks also verified: malformed tx hash → 400, nonexistent tx → 402 (never opens the gate).

### 3. The Graph — the truth layer

All payment/settlement history is indexed by a deployed subgraph. **The Trust Engine reads exclusively from The Graph** — never from the platform database — and the autonomous commerce pipeline *refuses to buy from providers without indexed settlement evidence*.

**Live subgraph status** (captured from `GET /api/developers/graph/status`):

```json
{
  "provider": "The Graph",
  "deploymentId": "QmPzoTATA5b9aYPCvDGMdD7Xe6uejX3nXiPXhEDLuRpCbu",
  "queryUrl": "https://api.studio.thegraph.com/query/1758639/globalpay-arc/version/latest",
  "indexedBlock": 61237228,
  "headBlock": 61237237,
  "lagBlocks": 9,
  "syncing": false,
  "paymentCount": 16,
  "settlementCount": 16,
  "invoiceReferenceCount": 15,
  "graphLive": true
}
```

**Raw GraphQL response** (latest indexed payments, verbatim):

```json
{
  "payments": [{
    "id": "0x38186dcc98d0bd8f6fa331878c5df74f28d4ae6f8e327bc6a26e44db7dcad048",
    "payer": "0x08a03ba5613cdb08b6e79cf8b0ec2005b37f4f35",
    "payee": "0x144a62dfa8bc0cc7b29ff5b0c1c43d773edafd16",
    "amount": "100000000000000",
    "status": "RELEASED",
    "transactionHash": "0x43691a08d8bcb4b4b335619565ece013e8de76f4a32febfdc3ddc2c921ec34c8",
    "blockNumber": "61052894"
  }],
  "settlements": [{ "id": "0x38186dcc…", "amount": "100000000000000", "blockNumber": "61052895" }]
}
```

Trust scores are **explainable by design**. Every score ships with its evidence bullets, e.g.:

> • 14 successful settlements of 14 indexed payments — 100.0% success rate
> • 0.0016 USDC total settlement volume
> • 12 unique buyers, 2 repeat buyers
> • Last settlement 4h ago; 3 payments in the last 7 days (accelerating)

Brand-new providers show **"Trust — (Unknown)"**, never a misleading low score: *trust becomes measurable after the first verified Graph settlement*. Fraud signals (self-payments, cancellation streaks, volume spikes, failure dominance) are detected from indexed history and lower both the score and the risk level.

### 4. World AgentKit — the human gate

Anyone can create agents and **buy**. To **sell** — publish a service or an agent listing — the developer must first verify personhood through World AgentKit. The gate is enforced in the production routes, not the UI:

```
POST /api/developers/services                        → requireWorldVerification middleware
POST /api/developers/agent-marketplace/agents/:id/publish → requireWorldVerification middleware
```

**Live proof** — publishing without verification:

```json
HTTP 403
{ "message": "World AgentKit verification required before publishing a service…" }
```

Deliberate design decision: World verification is **authorization, not reputation**. It never boosts trust scores — reputation comes only from on-chain settlement history. Verified-human gets you in the door; the market decides the rest.

---

## The Full Story, End to End

Every link in this chain was executed and verified on the live system:

```
 Developer (Supabase auth → organization → API keys)
      │
      ▼
 World AgentKit gate          403 "verification required" ← enforced in routes
      │
      ▼
 Create Agent                 MPC wallet minted on Arc
      │                       e.g. 0xF48709…EA988
      ▼
 Agent needs a capability     "Find the safest OCR provider"
      │
      ▼
 Observe — The Graph          provider settlement history queried live
      │
      ▼
 Decide — Trust Engine        score + confidence + risk flags + evidence bullets
      │                       (Graph-only; no Graph evidence → no purchase)
      ▼
 Act — x402 / PaymentManager  HTTP 402 challenge → agent pays its own wallet
      │                       0xa1705e74… (block 61218730, status 1)
      ▼
 Verify — The Graph           PaymentCreated + PaymentReleased indexed
      │                       subgraph lag ≈ 7–9 blocks
      ▼
 Invoice · Credits · Usage    platform ledger mirrors the chain
      │
      ▼
 Reputation & Webhooks        provider trust updates; HMAC-signed events fire
```

The **AI Assistant** (`/developer/assistant`) exposes this entire pipeline to a single sentence — *"Buy the safest OCR provider"* — and answers with the full Observe → Decide → Act → Verify trace: provider chosen, why (evidence bullets), Arc tx card, Graph verification card, invoice, credits.

## What's Built (all verified working)

**Developer Console** (44 pages): organizations, team, public profiles, API keys (`gpay_dev_ / gpay_sk_ / gpay_svc_`), webhooks (Stripe-grade: stats, secret rotation, delivery drawer, replay, test events, live 5s auto-refresh), playground (17 live endpoints, all tested), x402 console, Trust Engine, Autonomous Commerce, AI Assistant.

**Agent runtime**: create/suspend/rotate/delete agents, MPC balance checks, payments, history, stats, marketplace sessions, usage metering, invoices, reputation.

**Marketplace**: service publishing (metered pricing, x402 flag), agent store with versions and reviews, installations, disputes, revenue dashboards.

**Trust infrastructure**: Graph-backed trust scores with transparent formulas, risk flags (wash-trading, cancellation streaks, volume spikes), explainable recommendations, provider leaderboards.

**Verification results** (all 17 playground endpoints, live):

| Endpoint | Result | Endpoint | Result |
|---|---|---|---|
| Create Agent | ✅ 200 | Create Purchase Session | ✅ 400 validation |
| Pay (invalid addr) | ✅ 400 | Report Usage | ✅ 400 validation |
| Balance (live Arc) | ✅ 200 | List Invoices | ✅ 200 |
| History | ✅ 200 | Pay Invoice | ✅ 404 correct |
| Stats | ✅ 200 | Network Analytics | ✅ 200 |
| Rotate Key | ✅ 200 | Graph Status | ✅ 200 live |
| Publish Service (World gate) | ✅ 403 | x402 Premium | ✅ 402 challenge |
| Browse Marketplace | ✅ 200 | Install Agent | ✅ 404 correct |
| Invoke Service (svc key) | ✅ 401 | | |

## Running It

```bash
# Backend (port 5550)
cd backend && npm install && NODE_ENV=staging node server.js

# Frontend (port 5173)
cd client && npm install && npm run dev

# MPC signing nodes
cd mpc && go run ./cmd/node -port 8101   # ×3 nodes
```

Required env (backend `.env`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ARC_RPC_URL`, `GLOBAL_PAY_MANAGER_ADDRESS`, `GRAPH_API_KEY`, `GRAPH_QUERY_URL`, `MPC_SERVICE_TOKEN`, `WORLD_API_KEY`, `ENCRYPTION_KEY`.

## Honest Boundary

We label what's real and what isn't:

- ✅ **Real**: Arc transactions (hashes above), MPC wallet custody, live Graph subgraph, x402 on-chain verification + replay protection, World publish gate, trust scoring.
- ⚠️ **Labeled**: off-chain escrow records are explicitly marked *"off-chain ledger — hackathon demo, no on-chain funds moved"* in their API responses. We don't claim chain guarantees we don't have.

## Tech Stack

React 18 + Vite + Tailwind + TanStack Query · Node.js + Express + PostgreSQL (Supabase) · Solidity (`GlobalPayPaymentManager`) · ethers.js · Go (MPC threshold nodes) · The Graph subgraph ( AssemblyScript ) · World AgentKit · x402 protocol

---

**Arc moves the money. x402 prices the API. The Graph decides who to trust. World proves who's human. GlobalPay is where agents do business.**
