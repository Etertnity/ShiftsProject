import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { getErrorMessage } from '../utils/errors';

interface AsyncState<T> {
  data: T | undefined;
  /** Первая загрузка — показываем скелет/спиннер */
  loading: boolean;
  /** Повторная загрузка в фоне — данные уже на экране */
  refreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Загружает данные и умеет их перезагружать. Ответы устаревших запросов игнорируются,
 * поэтому быстрые переключения фильтров не перетирают свежий результат старым.
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[], errorMessage = 'Не удалось загрузить данные'): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const hasData = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await run();
      if (id !== requestId.current) return;
      hasData.current = true;
      setData(result);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      const message = getErrorMessage(err, errorMessage);
      setError(message);
      toast.error(message, { id: `load-error-${errorMessage}` });
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [run, errorMessage]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Ушли со страницы — ответ ещё не пришедшего запроса уже никому не нужен
  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  return { data, loading, refreshing, error, reload };
}
