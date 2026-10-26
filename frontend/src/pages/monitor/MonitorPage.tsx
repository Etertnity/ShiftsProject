import React, { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { AlertTriangle, Eye, LayoutGrid, Plus, RefreshCw, Rows, Search, ServerCrash, X } from 'lucide-react';
import { monitoringApi } from '../../api';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import PageHeader from '../../components/ui/PageHeader';
import { PageLoader } from '../../components/ui/Spinner';
import { useTheme } from '../../context/ThemeContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useNow } from '../../hooks/useNow';
import { Vessel } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import HiddenVesselsModal from './components/HiddenVesselsModal';
import VesselCard from './components/VesselCard';
import VesselFormModal from './components/VesselFormModal';
import { Filter, isStale, lossStats, matchesQuery, Period, PERIODS, SortMode, vesselState } from './monitorUtils';
import { useMonitorData } from './useMonitorData';

// Личные настройки вида — только в этом браузере
const prefs = {
  get: (key: string) => {
    try {
      return localStorage.getItem(`monitor:${key}`);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(`monitor:${key}`, value);
    } catch {
      /* без сохранения настроек */
    }
  },
};

const Segmented = <T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (value: T) => void;
  label: string;
}) => (
  <div className="flex shrink-0 gap-0.5 rounded-xl bg-gray-100 p-0.5" role="group" aria-label={label}>
    {options.map((option) => (
      <button
        key={String(option.value)}
        type="button"
        title={option.title}
        aria-pressed={value === option.value}
        onClick={() => onChange(option.value)}
        className={clsx(
          'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs font-medium transition-colors',
          value === option.value ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900',
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

/** ICMP Loss Monitor: потери пакетов до судов по данным Zabbix. */
const MonitorPage: React.FC = () => {
  const { isDark } = useTheme();
  useNow(30_000); // раз в 30 секунд обновляем «данные N мин назад»

  const [period, setPeriod] = useState<Period>(() => {
    const saved = Number(prefs.get('period'));
    return (PERIODS as readonly number[]).includes(saved) ? (saved as Period) : 12;
  });
  const [sort, setSort] = useState<SortMode>(() => (['list', 'name', 'loss', 'avg'].includes(prefs.get('sort') ?? '') ? (prefs.get('sort') as SortMode) : 'list'));
  const [dense, setDense] = useState(() => prefs.get('dense') === '1');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Vessel | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [flashId, setFlashId] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const config = useAsyncData(() => monitoringApi.config(), [], 'Не удалось загрузить настройки монитора');
  const vesselsData = useAsyncData(() => monitoringApi.vessels(), [], 'Не удалось загрузить список судов');

  const allVessels = useMemo(() => vesselsData.data ?? [], [vesselsData.data]);
  const vessels = useMemo(() => allVessels.filter((v) => !v.is_hidden), [allVessels]);
  const hidden = useMemo(() => allVessels.filter((v) => v.is_hidden), [allVessels]);
  const configured = !!config.data?.configured;

  const data = useMonitorData(vessels, period, configured);

  useEffect(() => prefs.set('period', String(period)), [period]);
  useEffect(() => prefs.set('sort', sort), [sort]);
  useEffect(() => prefs.set('dense', dense ? '1' : '0'), [dense]);

  // «/» — быстрый поиск, как в исходном мониторе
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !document.querySelector('[role="dialog"]')) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const cfg = config.data;
  const q = query.trim().toLowerCase();

  const { visible, counts } = useMemo(() => {
    const result = { visible: [] as Vessel[], counts: { all: 0, warn: 0, crit: 0, nodata: 0 } };
    if (!cfg) return result;
    for (const vessel of vessels) {
      const points = data.history[vessel.item_id];
      const state = vesselState(points, data.errors[vessel.item_id], cfg);
      const inWarn = state === 'warn' || state === 'crit';
      const inCrit = state === 'crit';
      const inNoData = state === 'nodata' || state === 'error' || isStale(points, cfg);
      result.counts.all += 1;
      if (inWarn) result.counts.warn += 1;
      if (inCrit) result.counts.crit += 1;
      if (inNoData) result.counts.nodata += 1;
      const inFilter = filter === 'all' || (filter === 'warn' && inWarn) || (filter === 'crit' && inCrit) || (filter === 'nodata' && inNoData);
      if (inFilter && matchesQuery(vessel, q)) result.visible.push(vessel);
    }
    if (sort === 'name') result.visible.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }));
    if (sort === 'loss' || sort === 'avg') {
      const key = (v: Vessel) => {
        const s = lossStats(data.history[v.item_id]);
        const value = sort === 'loss' ? s.last : s.avg;
        return value == null ? -1 : value;
      };
      result.visible.sort((a, b) => key(b) - key(a));
    }
    return result;
  }, [vessels, data.history, data.errors, cfg, filter, q, sort]);

  const updateHidden = async (targets: Vessel[], isHidden: boolean) => {
    try {
      await Promise.all(targets.map((v) => monitoringApi.updateVessel(v.id, { is_hidden: isHidden })));
      await vesselsData.reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось обновить список'));
    }
  };

  const hideVessel = async (vessel: Vessel) => {
    await updateHidden([vessel], true);
    toast(
      (t) => (
        <span className="flex items-center gap-3">
          «{vessel.name}» скрыто
          <button
            type="button"
            className="rounded-lg bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700"
            onClick={() => {
              toast.dismiss(t.id);
              updateHidden([vessel], false);
            }}
          >
            Отменить
          </button>
        </span>
      ),
      { duration: 7000 },
    );
  };

  const flash = (id: number) => setFlashId(id);
  // Подсветка гаснет сама; таймер снимается, если ушли со страницы или подсветили другое судно
  useEffect(() => {
    if (flashId === null) return undefined;
    const timer = window.setTimeout(() => setFlashId(null), 1700);
    return () => window.clearTimeout(timer);
  }, [flashId]);

  if (config.loading || vesselsData.loading || !cfg) return <PageLoader />;

  const loaded = vessels.filter((v) => data.history[v.item_id] !== undefined).length;
  const errorCount = vessels.filter((v) => data.errors[v.item_id]).length;
  const progressPct = data.progress.total ? Math.round((data.progress.done / data.progress.total) * 100) : 100;
  const notConfiguredErrors = configured ? data.errors : Object.fromEntries(vessels.map((v) => [v.item_id, 'Zabbix не подключён']));

  return (
    <div className="space-y-4">
      <PageHeader
        title="ICMP-монитор"
        description={`Потери пакетов до судов · пороги ${cfg.warn_threshold}% и ${cfg.crit_threshold}%`}
        actions={
          <>
            {hidden.length > 0 && (
              <Button variant="secondary" icon={Eye} onClick={() => setHiddenOpen(true)}>
                Скрытые · {hidden.length}
              </Button>
            )}
            <Button
              icon={Plus}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Добавить судно
            </Button>
          </>
        }
      />

      {!configured && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <ServerCrash className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Zabbix не подключён</p>
            <p className="mt-1 text-amber-800">
              Администратору нужно указать в <code className="rounded bg-amber-100 px-1">.env</code> сервера переменные{' '}
              <code className="rounded bg-amber-100 px-1">ZABBIX_URL</code>, <code className="rounded bg-amber-100 px-1">ZABBIX_USER</code> и{' '}
              <code className="rounded bg-amber-100 px-1">ZABBIX_PASSWORD</code>. Пароль хранится только на сервере и в браузер не попадает.
            </p>
          </div>
        </div>
      )}

      {/* Панель управления — закреплена при прокрутке длинного списка */}
      <div className="card sticky top-14 z-20 space-y-3 p-3 lg:top-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-full sm:basis-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              aria-label="Поиск судна"
              placeholder="Поиск судна или ID"
              className="form-input py-2 pl-9 pr-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (query ? setQuery('') : searchRef.current?.blur())}
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-gray-300 px-1.5 text-[10px] text-gray-400 sm:block">/</kbd>
            )}
          </div>

          <Segmented label="Период" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p, label: `${p}ч` }))} />

          <select aria-label="Сортировка" className="form-input h-9 w-auto py-1 text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
            <option value="list">Как в списке</option>
            <option value="name">По имени</option>
            <option value="loss">Потери сейчас ↓</option>
            <option value="avg">Средние потери ↓</option>
          </select>

          <button
            type="button"
            onClick={() => setDense((v) => !v)}
            aria-pressed={dense}
            title={dense ? 'Обычный вид' : 'Компактный вид'}
            aria-label="Компактный вид"
            className={clsx('flex h-9 w-9 items-center justify-center rounded-xl border transition-colors', dense ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-300 text-gray-500 hover:bg-gray-50')}
          >
            {dense ? <Rows className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="-mx-3 overflow-x-auto px-3 scrollbar-none">
            <Segmented
              label="Фильтр по состоянию"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: <>Все <b className="tabular-nums">{counts.all}</b></> },
                { value: 'warn', title: `Потери сейчас ≥ ${cfg.warn_threshold}%`, label: <>≥{cfg.warn_threshold}% <b className="tabular-nums text-amber-600">{counts.warn}</b></> },
                { value: 'crit', title: `Потери сейчас ≥ ${cfg.crit_threshold}%`, label: <>≥{cfg.crit_threshold}% <b className="tabular-nums text-red-600">{counts.crit}</b></> },
                { value: 'nodata', title: 'Нет данных, ошибка или данные старше 15 минут', label: <>Нет данных <b className="tabular-nums">{counts.nodata}</b></> },
              ]}
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500" aria-live="polite">
            <span className={clsx('h-2 w-2 rounded-full', data.busy ? 'animate-pulse bg-primary-500' : errorCount ? 'bg-red-500' : data.lastUpdate ? 'bg-emerald-500' : 'bg-gray-300')} />
            <span>
              Загружено <b className="text-gray-800">{loaded}</b>/{vessels.length}
            </span>
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-red-600" title="Ошибки загрузки">
                <AlertTriangle className="h-3.5 w-3.5" />
                {errorCount}
              </span>
            )}
            {data.lastUpdate && <span className="hidden sm:inline">обновлено {data.lastUpdate.toLocaleTimeString('ru-RU')}</span>}
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={data.busy} disabled={!configured} onClick={data.reload}>
              <span className="hidden xs:inline">Обновить</span>
            </Button>
          </div>
        </div>

        {/* Тонкий индикатор загрузки по нижнему краю панели */}
        <div className="pointer-events-none absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-full">
          <div
            className="h-full bg-primary-500 transition-[width,opacity] duration-300"
            style={{ width: `${progressPct}%`, opacity: data.busy ? 1 : 0 }}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Search}
            title={vessels.length === 0 ? 'Список судов пуст' : q ? `Ничего не найдено по запросу «${query.trim()}»` : 'В этой категории сейчас нет судов'}
            action={
              vessels.length > 0 && (q || filter !== 'all') ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  Сбросить поиск и фильтр
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className={clsx('grid gap-3', dense ? 'grid-cols-[repeat(auto-fill,minmax(250px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(min(100%,330px),1fr))]')}>
          {visible.map((vessel) => (
            <VesselCard
              key={vessel.id}
              vessel={vessel}
              points={data.history[vessel.item_id]}
              error={notConfiguredErrors[vessel.item_id]}
              period={period}
              config={cfg}
              dense={dense}
              isDark={isDark}
              flash={flashId === vessel.id}
              onEdit={(v) => {
                setEditing(v);
                setFormOpen(true);
              }}
              onHide={hideVessel}
            />
          ))}
        </div>
      )}

      <VesselFormModal
        open={formOpen}
        vessel={editing}
        onClose={() => setFormOpen(false)}
        onSaved={async (saved) => {
          setFormOpen(false);
          setQuery('');
          setFilter('all');
          await vesselsData.reload();
          flash(saved.id);
        }}
      />
      <HiddenVesselsModal
        open={hiddenOpen}
        vessels={hidden}
        onClose={() => setHiddenOpen(false)}
        onRestore={(targets) => updateHidden(targets, false)}
      />
    </div>
  );
};

export default MonitorPage;
