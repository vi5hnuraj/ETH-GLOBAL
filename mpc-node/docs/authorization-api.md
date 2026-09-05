# GlobalPay to MPC authorization contract

`POST /api/v1/signing-jobs` accepts a typed transaction intent, not raw signing
RPC. GlobalPay persists it as `requested`, then must validate JWT/session,
organization membership, RBAC, API-key scope, wallet ownership, active agent,
recipient policy, positive amount, per-transaction/daily/monthly limits,
balance plus gas reserve, permitted chain ID, chain nonce, and idempotency.

Only a successful durable decision creates an `authorized` signing job and an
authorization snapshot/hash. The node control endpoint receives the job ID,
wallet ID, chain ID, transaction digest, expiry, authorization hash, request
signature, and idempotency key. It rejects all other fields and independently
looks up the job/audit record. Node approval is fail-closed on unavailable DB,
policy, replay store, secret manager, or RPC.

State machine: `requested → authorized → quorum_pending → signing → signed →
broadcast → pending → confirmed|failed`. Every edge uses a DB transaction and
adds one immutable `mpc_state_transitions` row. `rejected` may follow any state
before signing; `failed` never triggers a blind retry or broadcast.
