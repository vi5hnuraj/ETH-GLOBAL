package config

// Development-only default secret values.
//
// These are used ONLY by the local-development loader (LoadDev) so a node
// boots on a laptop without ceremony. The production loader (Load) rejects any
// of them so a development value can never be mistaken for production custody.
// They are exposed as functions (not constants) so the production loader can
// build its rejection set from the same source of truth that LoadDev uses.

const (
	devDefaultTokenA       = "dev-token-a"
	devDefaultTokenB       = "dev-token-b"
	devDefaultTokenC       = "dev-token-c"
	devDefaultServiceToken = "dev-service-token"
)

// DevOnlyDefaultToken returns the development-only default bearer token for a
// node. Returns "" for an unknown node id.
func DevOnlyDefaultToken(nodeID string) string {
	switch nodeID {
	case "node-a":
		return devDefaultTokenA
	case "node-b":
		return devDefaultTokenB
	case "node-c":
		return devDefaultTokenC
	}
	return ""
}

// DevOnlyDefaultSecretHex returns the development-only default HMAC secret for
// a node as a 64-char hex string. Returns "" for an unknown node id.
func DevOnlyDefaultSecretHex(nodeID string) string {
	switch nodeID {
	case "node-a":
		return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	case "node-b":
		return "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"
	case "node-c":
		return "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"
	}
	return ""
}

// DevOnlyDefaultShareKeyHex returns the development-only default share
// encryption key as a 64-char hex string.
func DevOnlyDefaultShareKeyHex() string {
	return "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
}

// DevOnlyDefaultServiceToken returns the development-only default service
// bearer token accepted on the public coordinator/API routes.
func DevOnlyDefaultServiceToken() string { return devDefaultServiceToken }
