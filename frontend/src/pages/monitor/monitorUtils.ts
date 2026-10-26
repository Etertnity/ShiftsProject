import { LossPoint, MonitorConfig, Vessel, VesselState } from '../../types';

export const PERIODS = [1, 3, 6, 12, 24] as const;
export type Period = (typeof PERIODS)[number];

export type Filter = 'all' | 'warn' | 'crit' | 'nodata';
export type SortMode = 'list' | 'name' | 'loss' | 'avg';

export interface LossStats {
  last: number | null;
  min: number | null;
  avg: number | null;
  max: number | null;
  clock: number | null;
}

export const EMPTY_STATS: LossStats = { last: null, min: null, avg: null, max: null, clock: null };

export const nowSec = () => Math.floor(Date.now() / 1000);

export const lossStats = (points?: LossPoint[]): LossStats => {
  if (!points || points.length === 0) return EMPTY_STATS;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const [, value] of points) {
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }
  const [clock, last] = points[points.length - 1];
  return { last, min, max, avg: sum / points.length, clock };
};

export const levelOf = (value: number, config: MonitorConfig): 'ok' | 'warn' | 'crit' =>
  value >= config.crit_threshold ? 'crit' : value >= config.warn_threshold ? 'warn' : 'ok';

export const vesselState = (points: LossPoint[] | undefined, error: string | undefined, config: MonitorConfig): VesselState => {
  if (points === undefined) return error ? 'error' : 'loading';
  if (points.length === 0) return 'nodata';
  return levelOf(points[points.length - 1][1], config);
};

/** Последняя точка старше порога — данные «устарели» (судно пропало с радаров). */
export const isStale = (points: LossPoint[] | undefined, config: MonitorConfig) =>
  !!points?.length && nowSec() - points[points.length - 1][0] > config.stale_minutes * 60;

export const fmtPct = (value: number | null) => (value == null ? '—' : `${value.toFixed(1)}%`);

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtHM = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fmtFull = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${fmtHM(ms)}:${pad(d.getSeconds())}`;
};
export const fmtAgo = (sec: number) => {
  const minutes = Math.round(sec / 60);
  if (minutes < 60) return `${minutes} мин назад`;
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин назад`;
};

/** Точки графика с разрывами там, где данных не было (связь с судном пропадала). */
export const toChartPoints = (points: LossPoint[]) => {
  let gap = 300;
  if (points.length > 2) {
    const deltas: number[] = [];
    for (let i = 1; i < points.length; i += 1) deltas.push(points[i][0] - points[i - 1][0]);
    deltas.sort((a, b) => a - b);
    gap = Math.max(300, deltas[deltas.length >> 1] * 3);
  }
  const out: { x: number; y: number | null }[] = [];
  points.forEach(([clock, value], i) => {
    if (i && clock - points[i - 1][0] > gap) out.push({ x: (points[i - 1][0] + 1) * 1000, y: null });
    out.push({ x: clock * 1000, y: value });
  });
  return out;
};

export const TICK_STEP: Record<Period, number> = { 1: 10 * 60e3, 3: 30 * 60e3, 6: 3600e3, 12: 2 * 3600e3, 24: 4 * 3600e3 };

/** Деления оси времени по «круглым» местным часам. */
export const localTicks = (min: number, max: number, step: number) => {
  const offset = new Date(min).getTimezoneOffset() * 60e3;
  const ticks: { value: number }[] = [];
  for (let t = Math.ceil((min - offset) / step) * step + offset; t <= max; t += step) ticks.push({ value: t });
  return ticks;
};

export const niceMax = (max: number | null) => {
  const m = max || 0;
  return m <= 9 ? 10 : m <= 22 ? 25 : m <= 45 ? 50 : 100;
};

/** Ссылка на график в Zabbix за выбранный период. */
export const zabbixGraphUrl = (webUrl: string, itemId: string, period: Period) => {
  const from = { 1: 'now-1h', 3: 'now-3h', 6: 'now-6h', 12: 'now-12h', 24: 'now-1d' }[period];
  return `${webUrl}/history.php?action=showgraph&itemids%5B%5D=${itemId}&from=${encodeURIComponent(from)}&to=now`;
};

export const matchesQuery = (vessel: Vessel, query: string) =>
  !query || vessel.name.toLowerCase().includes(query) || vessel.item_id.includes(query);
