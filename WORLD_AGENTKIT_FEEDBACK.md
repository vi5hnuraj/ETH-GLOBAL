# World AgentKit Continuity Feedback

## Project

GlobalPay is an autonomous AI-commerce platform. World ID and AgentBook provide the human-backed identity layer; The Graph provides settlement evidence; Arc provides USDC settlement.

## AgentKit Usage

GlobalPay uses the official `@worldcoin/agentkit` package in:

- `backend/src/services/worldAgentKitService.js`
- `backend/src/services/agentBookRegistrationService.js`
- `backend/src/middleware/agentKitGate.js`

The integration uses AgentKit to:

- Resolve an agent wallet against the canonical AgentBook contract.
- Distinguish World ID account verification from wallet-specific AgentBook registration.
- Persist `agent_book_id`, `human_backed`, `world_verified`, and `agentbook_tx_hash` only after confirmation.
- Gate premium access and preferred x402 treatment for AgentBook-linked wallets.
- Preserve publisher continuity across multiple AgentBook-registered wallets.

## Integration Flow

```text
World ID Sandbox proof
        ↓
Account-level human verification
        ↓
Select an individual agent wallet
        ↓
Official agentkit-cli AgentBook registration
        ↓
World App approval
        ↓
AgentBook on-chain lookup confirmation
        ↓
Persist wallet-specific AgentBook identity
        ↓
AgentKit access policy / passport / continuity
```

World ID and AgentBook are deliberately separate:

- World ID verifies the developer/account once.
- AgentBook links a specific wallet to that verified human.
- `human_backed` alone never marks a wallet as AgentBook registered.
- The UI displays `AgentBook Registered` only when `agent_book_id` exists.

## Meaningful Product Use

AgentKit is used beyond a verification badge:

- **Publishing**: World ID gates publishing authorization.
- **Access**: AgentBook-linked wallets receive the preferred AgentKit/x402 access path.
- **Commerce**: AgentBook identity is shown as context before provider access and purchase decisions.
- **Trust**: Human-backed identity provides bounded identity context while The Graph supplies economic reliability.
- **Continuity**: Multiple AgentBook-linked wallets can be associated with one publisher profile.
- **Passports**: Agent identity, wallet registration, publisher continuity, Graph evidence, and settlement history are shown together.

## World ID Sandbox / Staging Test Matrix

The application includes a World ID staging surface at:

```text
/developer/world-verification
```

The following cases are supported by the implementation and must be demonstrated with the World ID Sandbox App before submission:

| Case | Expected result |
|---|---|
| Valid Sandbox proof | Account becomes World ID verified |
| Invalid proof | Verification rejected; nullifier is not persisted |
| Replayed proof | Replay protection rejects the proof |
| World ID verified, AgentBook not registered | Publishing is unlocked, wallet remains AgentBook pending |
| AgentBook QR approval | Wallet registration is confirmed after on-chain lookup |
| QR expiration | Session reports expiration and allows a new registration request |
| Approval delayed | Session remains `awaiting_confirmation` while polling continues |
| AgentBook lookup unavailable | Registration is not falsely marked complete |
| Multiple wallets | Each wallet requires its own AgentBook registration |
| Unregistered wallet | Wallet receives no fabricated AgentBook identity |

GlobalPay cannot extend the World-issued QR lifetime. The backend retains the local registration session for delayed confirmation, but the QR expiration remains controlled by World.

## Observed Developer Experience Feedback

### Clear

- The separation between account-level World ID and wallet-level AgentBook registration is important and maps well to real agent ownership.
- The official CLI flow produces a user-approvable World App request instead of asking GlobalPay to hold private keys.
- Independent AgentBook lookup after CLI completion prevents a local process exit from being treated as proof of registration.
- Explicit `awaiting_confirmation` state makes delayed indexing visible.

### Confusing or easy to misunderstand

- World ID verification and AgentBook registration are different operations and should not share a single generic “verified” badge.
- QR expiration is controlled by World and cannot be changed by the application.
- A World ID-verified account can publish before every wallet is AgentBook registered, while AgentBook-gated access remains wallet-specific.
- A wallet can be human-backed without having an `agent_book_id` until the wallet-specific registration completes.

### Debugging guidance

When registration appears stuck:

1. Check the browser registration state at `/developer/world-verification`.
2. Check whether the status is `pending`, `awaiting_confirmation`, `cli_submitted`, `completed`, or `failed`.
3. Confirm the wallet address shown in the request is the intended agent wallet.
4. Approve the request in the World App Sandbox.
5. Wait for AgentBook lookup/indexing confirmation.
6. Confirm the agent row has a real `agent_book_id` and `agentbook_tx_hash`.
7. Do not infer registration from `human_backed` alone.

## Sandbox Submission Note

The final hackathon submission should include a short screen recording using World ID Sandbox App test users. The recording should show:

```text
World ID proof
→ account verified
→ wallet selected
→ AgentBook QR generated
→ World App approval
→ AgentBook registration confirmed
→ Agent Passport updated
```

No World credentials, proof payloads, private keys, or API secrets belong in this repository.
