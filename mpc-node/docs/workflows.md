# MPC lifecycle and recovery workflows

## DKG and wallet creation

After policy authorization, all three independently authenticated nodes run the
reviewed library's distributed key generation with a fresh session ID. Each node
stores only its own resulting share encrypted through its own Vault/KMS/HSM
reference. The shared public key derives the EVM address. The API stores only
address, participant IDs, threshold metadata, and non-secret key version.

## Signing

The job is authorized and bound to one digest/chain ID/nonce. Any two eligible
nodes complete the library signing rounds over authenticated peer transport.
No node exports a share; the coordinator never receives protocol material. The
approved node service returns only a valid signature or a failure. Broadcast is
performed only after the Mainnet gate and receipt/reconciliation policy pass.

## Resharing, rotation, replacement, recovery

All operations begin with emergency-pause/operator approvals and an immutable
audit event. The reviewed library's resharing flow produces new encrypted shares
under a new key version while preserving the public key/address. Old shares are
retained only under time-limited encrypted recovery retention and destroyed per
policy after verification. A replacement node receives a new share via
resharing, never via export. Backups contain only HSM/Vault-encrypted node-local
share blobs and require separate recovery authorization; no workflow reconstructs
a plaintext private key.

## Emergency freeze

The durable control plane sets `mpc_controls.signing_paused=true`. Nodes read it
before DKG/sign/reshare/recovery and deny new protocol sessions. Existing jobs
transition to `failed` or `rejected` with an audit reason; no automatic resume.
