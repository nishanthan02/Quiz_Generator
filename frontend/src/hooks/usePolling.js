import { useState, useEffect, useRef, useCallback } from 'react';

export const usePolling = (fetchFn, id, intervalMs = 2000) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const timeoutRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const poll = useCallback(async () => {
    if (!id || !isPolling) return;
    try {
      const result = await fetchFn(id);
      if (!isMounted.current) return;
      setData(result);
      
      const terminalStates = ['complete', 'failed'];
      if (terminalStates.includes(result.status.toLowerCase())) {
        setIsPolling(false);
        if (result.status.toLowerCase() === 'failed') {
          setError(new Error(result.error_msg || 'Processing failed.'));
        }
      } else {
        timeoutRef.current = setTimeout(poll, intervalMs);
      }
    } catch (err) {
      if (!isMounted.current) return;
      setIsPolling(false);
      setError(err);
    }
  }, [fetchFn, id, isPolling, intervalMs]);

  useEffect(() => {
    if (isPolling) {
      poll();
    }
  }, [isPolling, poll]);

  const startPolling = useCallback(() => {
    setError(null);
    setIsPolling(true);
  }, []);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return { data, error, startPolling, stopPolling, isPolling };
};
