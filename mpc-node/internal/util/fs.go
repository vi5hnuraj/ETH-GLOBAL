// Package util holds small filesystem helpers shared across mpc-node packages.
package util

import (
	"os"
	"path/filepath"
)

// WriteAtomic writes data to path by writing a temp file in the same directory
// and renaming. The caller's dir must already exist and be 0o700.
func WriteAtomic(path string, data []byte, perm os.FileMode) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, perm); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// ReadFile is a thin wrapper around os.ReadFile.
func ReadFile(path string) ([]byte, error) { return os.ReadFile(path) }

// MkdirAll creates p as 0o700.
func MkdirAll(p string) error { return os.MkdirAll(p, 0o700) }

// EnsureParent makes the parent directory of p exist as 0o700.
func EnsureParent(p string) error { return os.MkdirAll(filepath.Dir(p), 0o700) }
