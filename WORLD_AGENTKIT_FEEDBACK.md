# World AgentKit Feedback

## Integration Experience

The AgentKit package was straightforward to install and lazy-load. The most
useful primitive for GlobalPay is the canonical AgentBook lookup, because it
allows the platform to resolve whether an agent wallet is backed by a verified
human without exposing that human's identity.

## Documentation

The official integration guide clearly explains:

- installing `@worldcoin/agentkit`
- registering an agent wallet with the CLI
- resolving AgentBook registration
- using `agentkit.fetch` for x402 calls
- server-side hooks for x402 protected resources

The distinction between AgentBook registration and runtime x402 verification
should be made more explicit for applications that use AgentKit only as an
authorization gate, such as GlobalPay's publishing flow.

## Developer Portal and Sandbox

The repository integration was not able to complete a World ID Sandbox proof.
No Sandbox credentials, test-user setup, proof payload, or registration receipt
was available in the environment. Consequently, valid/invalid/expired/reused
proof behavior remains unverified.

## Confusing or Missing Areas

- A clear documented Sandbox API walkthrough for a backend-only AgentBook lookup
  integration would help.
- The relationship between World ID proof, AgentBook registration, and runtime
  AgentKit/x402 verification should be shown as separate diagrams.
- Error examples for wallet mismatch, reused proof, and expired proof would make
  integration testing easier.
- Guidance for persisting AgentKit nonces and usage state in PostgreSQL or Redis
  should be more prominent for production deployments.

## GlobalPay Integration Feedback

GlobalPay uses World as an authorization layer: World verification unlocks
service publishing, while The Graph owns settlement reputation and Arc owns
payment execution. That separation is clear and useful. The remaining work is
to prove the official Sandbox proof flow and bind verification to the exact
agent being published.
