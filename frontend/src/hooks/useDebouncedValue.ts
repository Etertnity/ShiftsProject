import { useEffect, useState } from 'react';

/** Значение, которое обновляется только после паузы ввода — чтобы не слать запрос на каждую букву. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
