import { useState, useCallback, useRef } from 'react';

const TIMEOUT_MS = 10000;

export function useLoadWithTimeout() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (fn: () => Promise<unknown>, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setLoadError(false);

    let timedOut = false;
    timerRef.current = setTimeout(() => {
      timedOut = true;
      setLoadError(true);
      setLoading(false);
    }, TIMEOUT_MS);

    try {
      await fn();
    } catch {}

    if (!timedOut) {
      clearTimeout(timerRef.current);
      setLoading(false);
    }
  }, []);

  return { loading, loadError, run };
}
