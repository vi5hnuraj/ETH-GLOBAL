/**
 * TtlCache — small in-memory time-to-live cache.
 *
 * Used for expensive-but-recent aggregation results (analytics, monitoring,
 * balances) and for config lookups. Entries that exceed TTL are dropped on
 * read. Bounded max size evicts the oldest entry first (FIFO).
 */

const DEFAULT_TTL_MS = 10_000;

export class TtlCache {
  constructor({ ttlMs = DEFAULT_TTL_MS, maxSize = 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.at >= entry.ttl) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (this.map.size >= this.maxSize && !this.map.has(key)) {
      // Evict the oldest inserted key.
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    this.map.set(key, { value, at: Date.now(), ttl: ttlMs });
    return value;
  }

  /** Fetch from cache or compute + populate. */
  async getOrCompute(key, compute, ttlMs) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await compute();
    return this.set(key, value, ttlMs);
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}

/** Shared default cache instance for the whole process. */
export const cache = new TtlCache({ ttlMs: 10_000, maxSize: 2000 });