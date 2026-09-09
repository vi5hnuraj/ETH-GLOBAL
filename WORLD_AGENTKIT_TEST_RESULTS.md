# World AgentKit Test Results

## Scope

This report records only tests executed against the current repository/runtime.
No World ID Sandbox proof or AgentBook registration transaction is fabricated.

## Implementation Audit

| Requirement | Result | Evidence |
|---|---|---|
| AgentKit dependency installed | PASS | `backend/package.json` contains `@worldcoin/agentkit` `^0.2.1` |
| AgentBook verifier initialized | PASS | `worldAgentKitService.js:getAgentBookVerifier()` imports `createAgentBookVerifier()` |
| AgentBook lookup path | PASS | `lookupAgentBook(walletAddress)` calls `verifier.lookupHuman(walletAddress)` |
| Agent registration flow | PARTIAL | Registration is documented through CLI guidance; no registration transaction was executed by this repository |
| World ID Sandbox proof | NOT VERIFIED | No Sandbox credentials/proof fixture/session was available in the runtime |
| Verification persistence | PASS | `verifyAgent()` writes `world_verified`, `human_backed`, `agent_book_id`, `verification_method`, `world_verified_at` |
| Publishing gate | PARTIAL | `requireWorldVerification` protects service and agent-listing publish routes |
| Exact publishing agent | FAIL | Gate selects the developer's oldest agent rather than the requested publishing agent |

## Executed Evidence

Command:

```bash
node --input-type=module -e "import('./backend/src/services/worldAgentKitService.js').then(async m=>{console.log(await m.lookupAgentBook('0x144A62dFA8Bc0CC7b29ff5b0C1C43d773EDaFd16'));process.exit(0)})"
```

Result:

```text
AgentBook verifier initialized
null
```

This proves the SDK lookup path executes. It does not prove that this wallet is
registered or World ID verified.

## Sandbox Scenarios

| Scenario | Result |
|---|---|
| Valid proof | NOT VERIFIED |
| Invalid proof | NOT VERIFIED |
| Expired proof | NOT VERIFIED |
| Reused proof | NOT VERIFIED |
| Wallet mismatch | NOT VERIFIED |
| Unverified user | PARTIAL: unregistered AgentBook lookup returns no human ID |

## Current API Paths

```text
POST /api/developers/world/verify
GET  /api/developers/world/status/:agentId
POST /api/developers/world/lookup
GET  /api/developers/world/agents
```

## Current Blocking Gap

The official AgentKit documentation describes wallet registration through:

```bash
npx @worldcoin/agentkit-cli register <agent-address>
```

The repository resolves AgentBook state, but does not implement or execute the
World ID Sandbox proof/registration flow. Sandbox access and a real registered
wallet are required before this integration can be called fully verified.
