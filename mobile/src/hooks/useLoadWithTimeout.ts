import { useState, useCallback, useRef } from 'react';

// Must stay above the api client's own per-request timeout (client.ts, 15000ms) —
// otherwise this fires and shows "connection error" before a merely-slow (but
// working) request would have had a chance to finish or fail on its own.
const TIMEOUT_MS = 20000;

export function useLoadWithTimeout() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (fn: () => Promise<unknown>, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setLoadError(false);

    // Previously this only ever set loadError via the 20s ceiling below — a
    // screen whose load() actually rejects (rather than swallowing its own
    // errors) got neither an error nor real data for the full 20 seconds,
    // then finally showed a generic "check your connection" message that had
    // nothing to do with the real (possibly fast, possibly non-network)
    // failure. `settled` makes a genuine rejection surface immediately; the
    // timeout remains as a backup for a promise that never settles at all
    // (e.g. a stuck token refresh upstream — see useApi.ts's own timeout fix
    // for that specific case).
    let settled = false;
    timerRef.current = setTimeout(() => {
      if (settled) return;
      settled = true;
      setLoadError(true);
      setLoading(false);
    }, TIMEOUT_MS);

    try {
      await fn();
      if (!settled) {
        settled = true;
        clearTimeout(timerRef.current);
        setLoading(false);
      }
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timerRef.current);
        setLoadError(true);
        setLoading(false);
      }
    }
  }, []);

  return { loading, loadError, run };
}
