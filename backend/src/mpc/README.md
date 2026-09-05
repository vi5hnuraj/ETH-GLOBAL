# Audited external MPC integration

GlobalPay provides an integration/security layer only. It does **not** contain
threshold-signature code, key-share generation, node software, mock signatures,
or transaction-hash generation. Signing and Mainnet broadcasting remain paused.

[`auditedMpcProvider.js`](./auditedMpcProvider.js) is the stable provider
contract. An audited provider adapter may map its API to these operations:

- `createWallet`, `getWallet`, `getWalletAddress`, `getBalance`
- `authorizeSigning`, `signTransaction`, `broadcastTransaction`, `getTransactionStatus`
- `recoverKeyShares`, `rotateKeyShares`, `healthCheck`

The adapter makes no cryptographic assertions on behalf of the provider. Before
GlobalPay can unpause, an external implementation must prove and enforce a true
2-of-3 threshold protocol: no API process or individual provider participant
may reconstruct a private key or sign alone.

## Required external provider deliverables

1. Three independently deployed participant identities (A/B/C), distinct
   failure domains and network locations, using an audited 2-of-3 protocol.
   GlobalPay needs their three immutable HTTPS/mTLS endpoints; it does not run
   or emulate these nodes.
2. Per-node key-share custody in Vault, Cloud KMS/Key Vault, or HSM using
   workload identity. Supply secret references only; never supply master keys
   or shares to GlobalPay.
3. An mTLS PKI: CA bundle, GlobalPay client certificate/key, and node server
   certificates with SANs matching `MPC_NODE_[A-C]_URL`. Mount these as
   read-only secrets. The provider must require client certificates and reject
   TLS below 1.2.
4. A request-authentication credential referenced by
   `MPC_REQUEST_SIGNING_KEY_REF`, injected by the selected secret manager. The
   provider must validate `X-MPC-Timestamp`, `X-MPC-Nonce`, content hash and
   HMAC signature, enforce a narrow timestamp window, and persist consumed
   nonces durably.
5. A durable authorization/policy service that verifies GlobalPay authentication,
   organization RBAC, API-key scopes, recipient allow/deny rules, balance,
   amount/daily/monthly limits, idempotency, and chain ID **before** signing.
   It must record an immutable audit event for every authorization, rejection,
   signing attempt, recovery, rotation, and broadcast.
6. Provider health/metrics endpoints and alerts for individual node health,
   2-of-3 quorum loss, protocol disagreement, RPC failures, nonce/replay
   conflicts, policy rejections, suspicious payments, and treasury balance.
7. Documented, tested ceremonies for participant outage, share refresh/rotation,
   wallet recovery, disaster recovery, and incident pause. Recovery/rotation
   must preserve the wallet public address and historical transaction lookup.

## Required configuration

Production must provide `MPC_TRANSPORT=remote-2of3`, `SECRET_BACKEND` set to a
non-local supported backend, all three `MPC_NODE_*_URL` values, one selected
`MPC_SERVICE_URL` equal to a node endpoint, `MPC_REQUEST_SIGNING_KEY_REF`, and
the three mTLS file paths. `MPC_SIGNING_PAUSED=true` remains the safe default.
The runtime rejects missing, local, duplicate, or plaintext configuration.

The provider endpoint contract used by the adapter is under `/api/v1/wallets`:
wallets, balance, signing-job authorization/sign/broadcast, operations,
recovery, rotation, and `/api/v1/health`. A vendor adapter may translate these
calls internally without changing GlobalPay callers.
