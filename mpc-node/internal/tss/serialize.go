package tss

import (
	"encoding/json"
	"fmt"

	"github.com/bnb-chain/tss-lib/v3/ecdsa/keygen"
)

// SerializeSaveData marshals LocalPartySaveData to its JSON form. Callers must
// zero the returned bytes as soon as the encrypted share has been written.
func SerializeSaveData(sd *keygen.LocalPartySaveData) ([]byte, error) {
	if sd == nil {
		return nil, fmt.Errorf("tss: nil save data")
	}
	return json.Marshal(sd)
}

// DeserializeSaveData restores LocalPartySaveData from its JSON form.
func DeserializeSaveData(raw []byte) (*keygen.LocalPartySaveData, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("tss: empty save data")
	}
	var sd keygen.LocalPartySaveData
	if err := json.Unmarshal(raw, &sd); err != nil {
		return nil, fmt.Errorf("tss: unmarshal save data: %w", err)
	}
	sd.Validate()
	return &sd, nil
}