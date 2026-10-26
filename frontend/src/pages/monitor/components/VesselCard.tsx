import React, { memo, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Clock, EyeOff, ExternalLink, Pencil } from 'lucide-react';
import IconButton from '../../../components/ui/IconButton';
import { LossPoint, MonitorConfig, Vessel } from '../../../types';
import { fmtAgo, fmtFull, fmtHM, fmtPct, isStale, lossStats, nowSec, Period, vesselState, zabbixGraphUrl } from '../monitorUtils';
import LossChart from './LossChart';

interface VesselCardProps {
  vessel: Vessel;
  points?: LossPoint[];
  error?: string;
  period: Period;
  config: MonitorConfig;
  dense: boolean;
  isDark: boolean;
  /** Подсветить карточку (после добавления) */
  flash?: boolean;
  onEdit: (vessel: Vessel) => void;
  onHide: (vessel: Vessel) => void;
}

const BADGE = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-700 ring-amber-200',
  crit: 'bg-red-50 text-red-700 ring-red-200',
  muted: 'bg-gray-100 text-gray-500 ring-gray-200',
};

/** Карточка судна: текущие потери, график за период и сводка last/min/avg/max. */
const VesselCard: React.FC<VesselCardProps> = ({ vessel, points, error, period, config, dense, isDark, flash, onEdit, onHide }) => {
  const state = vesselState(points, error, config);
  const stats = lossStats(points);
  const stale = isStale(points, config);
  const level = state === 'crit' || state === 'warn' ? state : 'ok';
  const ref = useRef<HTMLElement>(null);

  // Только что добавленное судно — прокручиваем к нему и подсвечиваем
  useEffect(() => {
    if (flash) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [flash]);

  const badgeText = state === 'loading' ? '…' : state === 'error' ? 'ошибка' : state === 'nodata' ? 'нет данных' : fmtPct(stats.last);
  const overlay =
    state === 'loading' ? 'загрузка…' : state === 'error' ? `Не удалось загрузить: ${error}` : state === 'nodata' ? `Нет данных за ${period} ч` : '';

  return (
    <article
      ref={ref}
      className={clsx(
        'card group flex min-w-0 flex-col overflow-hidden transition-[box-shadow,border-color] duration-300 hover:shadow-pop',
        state === 'warn' && '!border-amber-400',
        state === 'crit' && '!border-red-500 shadow-[0_0_0_3px_rgb(239_68_68_/_0.12)]',
        flash && 'ring-4 ring-primary-500/40',
      )}
    >
      <header
        className={clsx(
          'flex items-center gap-2 border-b border-gray-100 py-1.5 pl-3 pr-1.5',
          state === 'warn' && 'bg-amber-50',
          state === 'crit' && 'bg-red-50',
        )}
      >
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900" title={`${vessel.name} · item ${vessel.item_id}`}>
          {vessel.name}
        </h3>
        <span
          className={clsx(
            'shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset',
            state === 'ok' || state === 'warn' || state === 'crit' ? BADGE[state] : BADGE.muted,
            state === 'crit' && 'animate-pulse',
          )}
        >
          {badgeText}
        </span>
        <div className="flex shrink-0 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          {config.web_url && (
            <a
              href={zabbixGraphUrl(config.web_url, vessel.item_id, period)}
              target="_blank"
              rel="noopener noreferrer"
              title="Открыть в Zabbix"
              aria-label="Открыть в Zabbix"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-primary-50 hover:text-primary-700"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <IconButton icon={Pencil} label="Редактировать" size="sm" tone="primary" onClick={() => onEdit(vessel)} />
          <IconButton icon={EyeOff} label="Скрыть" size="sm" tone="danger" onClick={() => onHide(vessel)} />
        </div>
      </header>

      <div className={clsx('relative', dense ? 'h-24' : 'h-36')}>
        {points && points.length > 0 && <LossChart points={points} period={period} config={config} level={level} isDark={isDark} />}
        {overlay && (
          <div className={clsx('absolute inset-0 flex items-center justify-center px-4 text-center text-xs', state === 'error' ? 'text-red-600' : 'text-gray-400')}>
            {overlay}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/70 px-3 py-1.5 text-[11px] text-gray-500">
        <span
          className={clsx('flex shrink-0 items-center gap-1', stale && 'font-medium text-amber-600')}
          title={stats.clock ? `Последняя точка: ${fmtFull(stats.clock * 1000)}` : undefined}
        >
          {stats.clock && (stale ? <AlertTriangle className="h-3 w-3" aria-hidden /> : <Clock className="h-3 w-3" aria-hidden />)}
          {stats.clock ? (stale ? fmtAgo(nowSec() - stats.clock) : fmtHM(stats.clock * 1000)) : ''}
        </span>
        <span className="min-w-0 truncate text-right tabular-nums">
          last <b className="font-semibold text-gray-800">{fmtPct(stats.last)}</b>
          {!dense && <span className="hidden 2xl:inline"> · min <b className="font-semibold text-gray-800">{fmtPct(stats.min)}</b></span>}
          {' '}· avg <b className="font-semibold text-gray-800">{fmtPct(stats.avg)}</b>
          {' '}· max <b className="font-semibold text-gray-800">{fmtPct(stats.max)}</b>
        </span>
      </footer>
    </article>
  );
};

export default memo(VesselCard);
