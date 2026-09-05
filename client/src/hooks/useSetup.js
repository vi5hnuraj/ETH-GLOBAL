import { useEffect, useState, useCallback, useRef } from 'react';
import developerApi from '../utils/developerApi';

/**
 * useSetup — checks whether the platform tables are provisioned (Phase 1).
 * Returns { status, loading, error, refresh }.
 *   status.setupRequired === true  → UI shows the Setup Required flow.
 *   status.setupRequired === false → platform is live.
 *
 * Loading always terminates: developerApi.status() has its own AbortController
 * timeout, and a watchdog races it so the hook can never stay in loading=true
 * forever. State updates after unmount are dropped.
 */
const STATUS_TIMEOUT_MS = 22000;

// Module-level cache so multiple DevPlatform mounts don't re-fetch
let cachedStatus = null;
let cachedAt = 0;
const STATUS_CACHE_TTL = 30_000; // 30 seconds

const useSetup = () => {
  const [status, setStatus] = useState(() => {
    // Return cached status immediately if fresh enough
    if (cachedStatus && Date.now() - cachedAt < STATUS_CACHE_TTL) return cachedStatus;
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const aliveRef = useRef(true);
  const loadIdRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      loadIdRef.current += 1;
    };
  }, []);

  const refresh = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const s = await Promise.race([
        developerApi.status(),
        new Promise((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error('Request timed out.'), { code: 'TIMEOUT' })), STATUS_TIMEOUT_MS)
        )
      ]);
      if (!aliveRef.current || loadId !== loadIdRef.current) return null;
      cachedStatus = s;
      cachedAt = Date.now();
      setStatus(s);
      setLoading(false);
      return s;
    } catch (err) {
      if (!aliveRef.current || loadId !== loadIdRef.current) return null;
      setError(err.message || 'Cannot reach the platform API.');
      return null;
    } finally {
      if (aliveRef.current && loadId === loadIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, loading, error, refresh };
};

export default useSetup;
