import { useCallback, useEffect, useRef, useState } from 'react';
import { monitoringApi } from '../../api';
import { LossPoint, Vessel } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { nowSec, Period } from './monitorUtils';

const PARALLEL = 8; // одновременных запросов к серверу
const INCREMENTAL_MS = 60 * 1000; // дозагрузка новых точек
const FULL_RELOAD_MS = 10 * 60 * 1000; // полная тихая перезагрузка

/**
 * Не больше PARALLEL запросов одновременно. cancelled() — очередь останавливается (ушли со страницы,
 * сменили период): раньше оставшиеся ~100 запросов уходили на сервер, хотя ответы уже никому не нужны.
 */
async function runPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  cancelled: () => boolean,
  onDone?: (done: number) => void,
) {
  const queue = [...items];
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, items.length) }, async () => {
      while (queue.length && !cancelled()) {
        const item = queue.shift() as T;
        await worker(item);
        done += 1;
        onDone?.(done);
      }
    }),
  );
}

export interface MonitorData {
  history: Record<string, LossPoint[]>;
  errors: Record<string, string>;
  busy: boolean;
  progress: { done: number; total: number };
  lastUpdate: Date | null;
  reload: () => void;
}

/**
 * Загрузка истории потерь для всех видимых судов: сначала целиком за период,
 * затем раз в минуту — только новые точки, раз в 10 минут — тихая полная перезагрузка.
 */
export function useMonitorData(vessels: Vessel[], period: Period, enabled: boolean): MonitorData {
  const [history, setHistory] = useState<Record<string, LossPoint[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const generation = useRef(0);
  const busyRef = useRef(false);
  const historyRef = useRef(history);
  historyRef.current = history;
  const vesselsRef = useRef(vessels);
  vesselsRef.current = vessels;

  const setPoints = (itemId: string, points: LossPoint[]) => setHistory((prev) => ({ ...prev, [itemId]: points }));
  const setError = (itemId: string, message?: string) =>
    setErrors((prev) => {
      if (!message && !(itemId in prev)) return prev;
      const next = { ...prev };
      if (message) next[itemId] = message;
      else delete next[itemId];
      return next;
    });

  const loadOne = useCallback(async (itemId: string, gen: number) => {
    try {
      const points = await monitoringApi.history(itemId, period);
      if (gen !== generation.current) return;
      setPoints(itemId, points);
      setError(itemId);
    } catch (error) {
      if (gen !== generation.current) return;
      setError(itemId, getErrorMessage(error, 'Ошибка загрузки'));
    }
  }, [period]);

  /** Полная загрузка. clear — сбросить графики (смена периода), иначе тихо обновить поверх. */
  const loadAll = useCallback(async (clear: boolean) => {
    const gen = ++generation.current;
    const ids = vesselsRef.current.map((v) => v.item_id);
    if (clear) {
      setHistory({});
      setErrors({});
    }
    busyRef.current = true;
    setBusy(true);
    setProgress({ done: 0, total: ids.length });
    await runPool(
      ids,
      (id) => loadOne(id, gen),
      () => gen !== generation.current,
      (done) => gen === generation.current && setProgress({ done, total: ids.length }),
    );
    if (gen !== generation.current) return;
    busyRef.current = false;
    setBusy(false);
    setLastUpdate(new Date());
  }, [loadOne]);

  /** Дозагрузка новых точек — у каждого судна от его собственной последней точки. */
  const incremental = useCallback(async () => {
    // Вкладка скрыта — не опрашиваем Zabbix впустую; при возвращении догрузим сразу
    if (busyRef.current || document.hidden) return;
    const gen = generation.current;
    busyRef.current = true;
    setBusy(true);
    const cutoff = nowSec() - period * 3600;
    await runPool(vesselsRef.current, async (vessel) => {
      const current = historyRef.current[vessel.item_id];
      if (!current?.length) {
        await loadOne(vessel.item_id, gen);
        return;
      }
      try {
        const fresh = await monitoringApi.historySince(vessel.item_id, current[current.length - 1][0] + 1);
        if (gen !== generation.current) return;
        setHistory((prev) => {
          const base = prev[vessel.item_id] ?? [];
          return { ...prev, [vessel.item_id]: base.concat(fresh).filter((p) => p[0] >= cutoff) };
        });
        setError(vessel.item_id);
      } catch (error) {
        if (gen !== generation.current) return;
        setError(vessel.item_id, getErrorMessage(error, 'Ошибка загрузки'));
      }
    }, () => gen !== generation.current);
    if (gen !== generation.current) return;
    busyRef.current = false;
    setBusy(false);
    setLastUpdate(new Date());
  }, [period, loadOne]);

  // Смена периода или включение — загружаем всё заново
  useEffect(() => {
    if (!enabled) return undefined;
    loadAll(true);
    const inc = window.setInterval(incremental, INCREMENTAL_MS);
    const full = window.setInterval(() => !busyRef.current && !document.hidden && loadAll(false), FULL_RELOAD_MS);
    // Вернулись на вкладку — сразу подтягиваем пропущенные точки
    const onVisible = () => !document.hidden && incremental();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(inc);
      window.clearInterval(full);
      document.removeEventListener('visibilitychange', onVisible);
      generation.current += 1; // отменяем ответы на уже ушедшие запросы
      busyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, enabled]);

  // Новые суда (добавили или вернули из скрытых) догружаем по одному, не трогая остальные
  const idsKey = vessels.map((v) => v.item_id).join(',');
  useEffect(() => {
    if (!enabled) return;
    // Графики скрытых/удалённых судов больше не нужны — не держим их точки в памяти
    const keep = new Set(vessels.map((v) => v.item_id));
    const prune = <V,>(prev: Record<string, V>) =>
      Object.keys(prev).some((id) => !keep.has(id)) ? Object.fromEntries(Object.entries(prev).filter(([id]) => keep.has(id))) : prev;
    setHistory(prune);
    setErrors(prune);
    if (busyRef.current) return;
    const missing = vessels.filter((v) => historyRef.current[v.item_id] === undefined);
    if (missing.length === 0) return;
    const gen = generation.current;
    runPool(missing, (v) => loadOne(v.item_id, gen), () => gen !== generation.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, enabled]);

  const reload = useCallback(() => {
    if (!busyRef.current) loadAll(false);
  }, [loadAll]);

  return { history, errors, busy, progress, lastUpdate, reload };
}
