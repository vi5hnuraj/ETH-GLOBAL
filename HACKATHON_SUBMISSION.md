# 🏆 ETHGlobal ETHOnline 2026 — Arc Track Submission

**Project Name**: GlobalPay (Arc L1 Edition)
**Track**: Continuity Track
**Targeted Prizes**:
1. 🥇 **Best DeFi or Agentic Application** ⸺ **$1,666**
2. 🚀 **Launch on Arc Testnet & Push to Mainnet** ⸺ **$1,500**

---

## 💡 Elevator Pitch
**GlobalPay on Arc** is a stablecoin-native financial platform and autonomous AI agent economy powered by Circle’s Arc L1. By leveraging **USDC as native gas**, programmable conditional escrows, and the **Circle Agent Stack**, GlobalPay empowers autonomous AI bots and human developers to hold wallets, enforce policy-governed micro/nanopayments, and settle complex multi-step workflows without friction.

---

## 🌟 Key Features Built for Arc

### 1. Stablecoin-Native DeFi on Arc
* **Native USDC Gas**: Configured for Arc Testnet (`Chain ID: 5042002`) and deployment-ready for Arc Mainnet (`5042001`).
* **Programmable Conditional Escrow**: Multi-step milestone settlement engine holding USDC on Arc and releasing funds upon verified trigger events.
* **Circle Gateway / CCTP Cross-Chain Bridge**: Unified balance routing between Arc and EVM ecosystems.

### 2. Autonomous AI Agent Economy (Circle Agent Stack)
* **Autonomous Headless Wallets**: AI Agents mint and operate their own wallets on Arc.
* **Spending Policy Engine**: Dynamic guardrails enforcing daily budgets and max per-transaction limits.
* **Agent-to-Agent Nanopayments**: Micro-settlement protocol for pay-per-inference and automated service composition.
* **LLM Tool Registry**: Built-in Groq/LLM tool calls for `sendUsdcOnArc`, `createArcEscrow`, `executeAgentNanopayment`, and `checkArcBalance`.

### 3. Reown AppKit & Arc Connect UI
* Seamless Web3 connection using `@reown/appkit` configured with Arc Testnet & Mainnet definitions.
* Real-time network health monitor, faucet shortcuts, and block explorer deep-links to ArcScan.

---

## 📊 Continuity Track Disclosure (Pre-Existing vs. New Work)

| Area | Pre-Existing Baseline | New Hackathon Features Built for Arc |
|---|---|---|
| **Network & Gas** | Legacy testnet configuration with gas in volatile tokens | Full **Arc L1 integration** (`5042002`), **USDC native gas tokenomics**, multi-RPC resilient provider |
| **Agent Stack** | Basic agent metadata schema | **Circle Agent Stack**: Autonomous spending policies, policy enforcement, agent-to-agent nanopayments, tool calling architecture |
| **Programmable Money** | Standard fiat & basic transfers | **Programmable conditional escrows**, multi-step milestone releases, Circle Gateway / CCTP cross-chain bridge logic |
| **Frontend & AppKit** | Legacy chain selectors | **Reown AppKit with Arc Testnet / Mainnet**, `ArcConnectWallet` component, live ArcScan integration |
| **Backend Services** | Generic services | Dedicated `arcService.js`, `/api/arc/*` REST endpoints, resilient circuit breaker for Arc RPCs |

---

## 🛠️ Tech Stack & Circle Developer Tools
* **Blockchain**: Arc L1 (Testnet `5042002`, Mainnet `5042001`)
* **Settlement Asset**: USDC (Native Gas & Value Transfer)
* **Developer Tools**: Circle Agent Stack, Reown AppKit, Circle Gateway / CCTP, ethers.js, Groq AI Tool Calling
* **Frontend**: React 18, Vite, TailwindCSS, Recharts, Lucide/Feather Icons
* **Backend**: Node.js, Express, PostgreSQL / Supabase, Resilient RPC Provider with Circuit Breaker

---

## 🔗 Resources & Deployment Details
* **Arc Testnet RPC**: `https://rpc.testnet.arc.io` (Fallbacks: Blockdaemon, dRPC, QuickNode)
* **Arc Testnet Explorer**: [testnet.arcscan.app](https://testnet.arcscan.app)
* **Circle Faucet**: [faucet.circle.com](https://faucet.circle.com)
* **Architecture Document**: [ARCHITECTURE.md](file:///Users/admin/Downloads/global/ARCHITECTURE.md)
