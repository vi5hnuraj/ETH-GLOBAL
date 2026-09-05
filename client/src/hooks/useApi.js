import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useApi — lightweight data fetching hook with loading, error, background
 * refresh and optional retry. Used across the Developer Platform.
 *
 * Guarantees a terminal loading state:
 *   loading -> success | error | timeout
 * A watchdog races every fetcher against `timeout`, so even a fetcher whose
 * promise never settles (a request without its own AbortController) can never
 * leave the UI stuck in loading. Overlapping loads are de-duplicated via a
 * load id, and state updates after unmount are dropped.
 */
const DEFAULT_TIMEOUT_MS = 25000;

const useApi = ({ fetcher, deps = [], enabled = true, retry = 0, timeout = DEFAULT_TIMEOUT_MS }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const aliveRef = useRef(true);
  const loadIdRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      loadIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enabled]);

  const withTimeout = useCallback((promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('Request timed out.'), { code: 'TIMEOUT' })), ms)
    )
  ]), []);

  const load = useCallback(async (opts = {}) => {
    if (!enabledRef.current) return null;
    const loadId = ++loadIdRef.current;
    if (opts.background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await withTimeout(fetcherRef.current(), timeout);
      if (!aliveRef.current || loadId !== loadIdRef.current) return null;
      setData(result);
      return result;
    } catch (err) {
      if (!aliveRef.current || loadId !== loadIdRef.current) return null;
      setError(err);
      if (retry > 0 && !opts.silent) {
        for (let attempt = 1; attempt <= retry; attempt += 1) {
          await new Promise((r) => setTimeout(r, 800 * attempt));
          if (!aliveRef.current || loadId !== loadIdRef.current) return null;
          try {
            const result = await withTimeout(fetcherRef.current(), timeout);
            if (!aliveRef.current || loadId !== loadIdRef.current) return null;
            setData(result);
            setError(null);
            return result;
          } catch (e) {
            if (attempt === retry) setError(e);
          }
        }
      }
      return null;
    } finally {
      if (aliveRef.current && loadId === loadIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, retry, timeout, withTimeout]);

  useEffect(() => {
    if (enabled) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, ...deps]);

  return { data, loading, refreshing, error, refresh: load, setData };
};

export default useApi;
