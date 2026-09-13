# World AgentKit Continuity — Integration Status

## Summary

GlobalPay implements a meaningful World AgentKit integration covering identity verification,
AgentBook wallet registration, publishing authorization, and agent continuity.

## Requirements Checklist

| Requirement | Status | Details |
|---|---|---|
| Uses AgentKit meaningfully | ✅ Complete | AgentBook verifier initialized, queried, and used across publishing, access, commerce, and trust |
| Working application | ✅ Complete | Full Developer Console with 60+ pages, marketplace, autonomous commerce, and AI operator |
| Registers/resolves agents through AgentBook | ✅ Complete | AgentBook lookup resolves wallet identity; registration supported via CLI + World App flow |
| Uses World ID Sandbox App | ✅ Supported | World ID staging surface at `/developer/world-verification` supports Sandbox proof flow |
| Authorization enforcement | ✅ Complete | `requireWorldVerification` middleware gates service and agent-listing publishing |
| Feedback document | ✅ Complete | `WORLD_AGENTKIT_FEEDBACK.md` included in repository |

## Integration Architecture

```text
World ID proof → account verification
        ↓
AgentKit CLI → wallet registration
        ↓
World App → approval flow
        ↓
AgentBook lookup → on-chain confirmation
        ↓
Persistence → agent_book_id + human_backed flags
        ↓
Product surfaces → publishing gate, access policy, passports, continuity
```

## Product Surfaces Using AgentKit

| Surface | Integration |
|---|---|
| Publishing gate | Service and agent-listing publishing requires World ID verification |
| Access policy | AgentBook-linked wallets receive preferred x402 and service access |
| Agent Passport | Displays AgentBook registration, publisher continuity, and Graph evidence |
| Trust context | Human-backed identity provides bounded identity alongside Graph economic evidence |
| Multi-wallet continuity | Multiple AgentBook-registered wallets linked to one publisher profile |

## Demo Flow

```text
Create agent → MPC wallet minted
        ↓
World verification → human-backed identity confirmed
        ↓
AgentBook registration → wallet linked to verified human
        ↓
Publish service → World gate enforced
        ↓
Consumer discovers service → sees human-backed badge
        ↓
Trust Engine evaluates → Graph evidence + identity context
        ↓
Purchase with USDC on Arc → settlement verified
        ↓
Agent Passport → full identity + economic history
```

## Key Design Decisions

1. **World ID = authorization, not reputation.** Verification unlocks publishing but never boosts trust scores. Trust comes exclusively from on-chain settlement evidence via The Graph.

2. **AgentBook = wallet-specific, not account-level.** A developer can be World ID verified while individual wallets require separate AgentBook registration.

3. **Human-backed ≠ AgentBook registered.** The `human_backed` flag indicates World ID verification; `agent_book_id` indicates wallet-specific registration. Both are displayed separately.

4. **Publisher continuity.** Multiple AgentBook-registered wallets can be associated with one publisher profile, maintaining identity continuity across agent wallets.
