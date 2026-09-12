# GlobalPay × Arc / Circle — Continuity Submission

GlobalPay is an autonomous agent economy on Arc. Agents discover paid AI services, evaluate providers using live settlement evidence, apply spending policy, pay in native USDC, and verify the result through The Graph.

This document explains the Arc/Circle portion of the Continuity submission. The Graph integration is documented separately in [`THE_GRAPH_README.md`](./THE_GRAPH_README.md), and World/AgentKit integration is documented in [`WORLD_AGENTKIT_FEEDBACK.md`](./WORLD_AGENTKIT_FEEDBACK.md).

## Bounty Positioning

GlobalPay is submitted for the **Continuity — Best DeFi or Agentic Application** direction, specifically:

```text
Build autonomous agents that transact on Arc.
```

The implemented use case is autonomous service commerce:

```text
AI agent goal
→ provider discovery
→ Graph-backed trust/risk decision
→ spending-policy check
→ prepaid native USDC payment on Arc
→ indexed settlement verification
→ service credit / access receipt
```

GlobalPay is an existing open-source product. The Continuity work extends it with the Graph Trust Engine, MCP tooling, policy-aware autonomous execution, AgentKit identity continuity, and polished Arc payment/verification flows.

## Why Arc and USDC Are Load-Bearing

Arc is not only displayed as a network label. It is the payment and settlement layer for the core commerce operation:

- Every agent has an Arc-compatible wallet identity.
- Agent balances are checked against live Arc RPC data.
- Prepaid service purchases calculate exact USDC amounts.
- The consumer agent wallet signs the payment through the MPC wallet service.
- The GlobalPay Payment Manager performs the settlement path.
- Provider and platform amounts are recorded from the same payment.
- ArcScan transaction links are returned to users.
- The Graph verifies the indexed settlement before the platform claims completion.

The app uses Arc Testnet during the hackathon:

```text
Network: Arc Testnet
Chain ID: 5042002
Native gas/settlement asset: USDC
RPC: https://rpc.testnet.arc.io
Explorer: https://testnet.arcscan.app
Faucet: https://faucet.circle.com
```

## Agentic Economy Flow

### Consumer agent

The consumer agent is the paying agent selected by the developer. It has:

- An agent ID.
- An MPC wallet ID.
- An Arc wallet address.
- A spending policy context.
- A transaction history scoped to its own wallet/agent UUID.

### Provider agent

The provider agent owns a published Marketplace service. It has:

- A provider wallet.
- A service endpoint.
- A USDC price and unit.
- Capabilities and health metadata.
- Graph-indexed settlement evidence when payments exist.

### Automatic mode

```text
User selects Act / Execute
→ Agent discovers provider
→ Graph trust is calculated
→ Policy is checked
→ Prepaid intent is created
→ MPC wallet signs Arc payment
→ Payment Manager settles USDC
→ Graph confirms indexed settlement
```

### Approval mode

```text
User selects Approval required
→ Agent discovers and evaluates provider
→ Policy is checked
→ Prepaid intent is prepared
→ No funds are sent
→ User clicks Approve and pay on Arc
→ Existing prepaid confirmation path executes
```

The backend enforces this distinction. The frontend cannot bypass it.

## Programmable Money Controls

Before automatic payment, GlobalPay checks:

- Whether automatic purchasing is enabled.
- Monthly procurement budget.
- Current paid/pending monthly spend.
- Provider and trust policy constraints.
- Consumer wallet identity.
- Provider health and endpoint availability.
- Self-purchase prevention.
- Available Arc USDC balance.

If the payment fails a policy check, the system returns an approval or blocked state rather than sending funds.

## Real Arc Payment Path

The primary prepaid settlement implementation is in:

```text
backend/src/services/commerceService.js
backend/src/services/agentDecisionEngine.js
backend/src/services/arcService.js
backend/src/services/serviceGateway.js
```

The payment lifecycle is:

```text
createPrepaidIntent()
→ purchase_sessions.awaiting_payment
→ confirmPrepaidPurchase()
→ MPC wallet contract call
→ GlobalPayPaymentManager.settleInvoice()
→ GlobalPayPaymentManager.release()
→ Arc transaction hash
→ Graph verification
→ service invoice paid
→ credits/access granted
```

The system does not claim provider execution when the flow only reserves credits. If `invoke: false`, the honest result is:

```text
Payment completed · Credit reserved
```

## Circle / Arc Feature Status

| Feature | Status | Notes |
|---|---:|---|
| Arc Testnet | Live | Chain `5042002` |
| Native USDC payment | Live | Prepaid service commerce |
| Agent wallet payments | Live | MPC-backed wallet service |
| Payment Manager | Live | Contract settlement path |
| Spending policy | Live | Automatic/approval enforcement |
| Agent-to-service commerce | Live | Consumer pays provider |
| ArcScan receipts | Live | Returned after successful payment |
| Graph verification | Live | Indexed payment confirmation |
| Nanopayment function | Implemented path | Requires funded wallet and valid recipient |
| Circle Gateway/CCTP | Not implemented | Endpoint fails closed with explicit error |
| Paymaster | Not implemented | Do not claim in submission |
| StableFX | Not implemented | Do not claim in submission |
| Arc Mainnet | Not deployed | Testnet is the demo environment |

## Functional Demo

Use a funded Arc Testnet consumer agent and a reachable provider service.

1. Open `/developer/assistant`.
2. Select `Act / Execute`.
3. Select the consumer agent with an MPC wallet and USDC balance.
4. Enter:

```text
Buy the safest OCR provider.
```

5. Show the live Graph provider evidence and trust ranking.
6. Show the policy decision.
7. Show the prepaid Arc payment.
8. Open the ArcScan transaction.
9. Show Graph verification.
10. Show the invoice/credit receipt.

For a no-payment demonstration, use `Ask / Analyze` or `Approval required`.

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full Mermaid diagram and text fallback.

```text
World ID / AgentBook → agent identity
The Graph → provider evidence
AI Operator → decision
Procurement policy → authorization
MPC wallet → transaction signing
Arc / USDC → settlement
The Graph → verification
Service Gateway → access and invocation
```

## Public Submission Checklist

The public repository should include:

- `ARCHITECTURE.md`
- `ARC_CIRCLE_README.md`
- `THE_GRAPH_README.md`
- `WORLD_AGENTKIT_FEEDBACK.md`
- `backend/src/services/arcService.js`
- `backend/src/services/commerceService.js`
- `backend/src/services/agentDecisionEngine.js`
- `client/src/pages/developer/DevAutonomousCommerce.jsx`
- `client/src/pages/developer/DevAiAssistant.jsx`

Never commit:

- `.env` files.
- MPC/private wallet secrets.
- Graph API keys.
- Database credentials.
- World ID proof payloads.

## Mainnet Note

The current project is deployed for Arc Testnet demonstration. Arc Mainnet deployment requires a separate production configuration, mainnet contract addresses, funded production wallets, mainnet Graph indexing, and a full security review. Do not claim Mainnet deployment until that deployment is live and demonstrated.
