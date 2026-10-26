import { useEffect, useState } from 'react';

/** Текущее время, обновляемое раз в минуту — чтобы статусы смен менялись без перезагрузки. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
