// Package tss wires one tss-lib party per OS process into the node engine.
// A node runs exactly ONE party per session and never holds another party's
// share, so no single node can reconstruct the private key or sign alone.
package tss

import (
	"crypto/sha256"
	"fmt"
	"math/big"

	"github.com/bnb-chain/tss-lib/v3/tss"
)

// DeriveSortedPartyIDs deterministically creates `count` sorted party IDs from
// a shared session seed. Every node in the session derives the identical
// roster so the tss-lib party contexts agree across processes.
func DeriveSortedPartyIDs(seed []byte, count int) (tss.SortedPartyIDs, error) {
	if len(seed) == 0 || count <= 0 {
		return nil, fmt.Errorf("tss: invalid seed (%d bytes) or count %d", len(seed), count)
	}
	unsorted := make(tss.UnSortedPartyIDs, count)
	for i := 0; i < count; i++ {
		h := sha256.New()
		h.Write(seed)
		h.Write([]byte{byte(i)})
		key := new(big.Int).SetBytes(h.Sum(nil))
		id := fmt.Sprintf("%d", i+1)
		unsorted[i] = tss.NewPartyID(id, "P["+id+"]", key)
	}
	return tss.SortPartyIDs(unsorted), nil
}

// ReconstructSortedPartyIDs rebuilds the roster from the keys stored in DKG
// save data (Ks). This is the safe way to reproduce the identical roster a
// node will use for later signing, matching exactly the keys tss-lib expects.
func ReconstructSortedPartyIDs(keys []*big.Int) tss.SortedPartyIDs {
	unsorted := make(tss.UnSortedPartyIDs, len(keys))
	for j, key := range keys {
		id := fmt.Sprintf("%d", j+1)
		unsorted[j] = tss.NewPartyID(id, "P["+id+"]", key)
	}
	return tss.SortPartyIDs(unsorted)
}

// PartyIndex finds the sorted index of a party id, or -1.
func PartyIndex(pids tss.SortedPartyIDs, id string) int {
	for i, p := range pids {
		if p.Id == id {
			return i
		}
	}
	return -1
}

// PartyIDIndex finds the roster entry with the given sorted index.
func PartyIDAt(pids tss.SortedPartyIDs, idx int) (*tss.PartyID, error) {
	if idx < 0 || idx >= len(pids) {
		return nil, fmt.Errorf("tss: party index %d out of range [0,%d)", idx, len(pids))
	}
	return pids[idx], nil
}