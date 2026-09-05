# Authenticated MPC peer protocol contract

This is the security contract for the future reviewed node implementation; it
is not a replacement for the selected library's wire protocol.

Every peer packet must include: protocol version, wallet ID, immutable session
ID, round number, sender node ID, recipient set, issued-at, expires-at, unique
nonce, SHA-256 payload hash, and detached signature. It travels only over mTLS.

Receiving nodes must, in this order: validate client certificate chain/SAN and
SPIFFE identity against an allowlist; validate sender node ID; validate the
session belongs to the wallet and has not expired; validate time skew (maximum
60 seconds); atomically insert the nonce in the durable replay database; verify
the hash/signature; enforce expected protocol round/recipient; then pass bytes
to the reviewed library. The signature is an application-identity signature,
not a substitute for any protocol proof.

Nodes must use point-to-point and reliable-broadcast channels exactly as
required by the reviewed library. Protocol bytes, shares, Paillier material,
and transcripts are never sent to Express, browsers, logs, or PostgreSQL.
Network policy allows only API-to-node control traffic and node-to-node mTLS;
nodes have no public ingress.
