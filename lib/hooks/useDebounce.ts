'use client';

import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export function useDebounce<T>(
  value: T,
  delayMs = 300,
): [T, Dispatch<SetStateAction<T>>] {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);

  return [debounced, setDebounced];
}
