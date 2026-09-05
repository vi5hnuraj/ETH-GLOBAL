# Deployment, secrets, monitoring, and review checklist

Deploy Node A/B/C into three separate accounts/clusters/failure domains. Each
uses a unique workload identity, TLS keypair, Vault/KMS/HSM role, database role,
and egress policy. API control traffic is allowed to each node; only peer mTLS
is allowed between nodes. No node has a public load balancer.

Vault paths: `kv/data/globalpay/mpc/<environment>/<node>/share`,
`.../peer-message-key`, and API request-verification material. Policies must
allow a node only its own share path and decrypt key; API may read neither share
path. Certificates are issued by a dedicated MPC intermediate CA with SAN/SPIFFE
identities `spiffe://globalpay/mpc/node-{a,b,c}` and
`spiffe://globalpay/api`. Rotate certificates and peer signing keys separately.

Required monitoring: node health, mTLS failures, quorum loss, protocol aborts,
peer disagreement, replay conflicts, signing latency/failures, Vault/KMS errors,
DB errors, RPC errors, nonce conflicts, policy rejects, wallet balances, and
pending/unreconciled broadcasts. Alert on any quorum loss, signature attempt
while paused, or secret-access denial.

Before Mainnet: independent cryptographic and architecture review; dependency
SBOM/vulnerability scan; DKG/sign/reshare vectors from the selected library;
three real-node tests for every single-node outage and every two-node outage;
unauthorized-peer/replay/DB/Vault/RPC failure tests; recovery drill; external
penetration test; operator runbook approval; testnet transaction/reconciliation;
then a separately approved minimal Mainnet transaction. Keep
`MAINNET_BROADCAST_ENABLED=false` until all gates pass.
