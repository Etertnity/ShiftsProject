import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Search, X } from 'lucide-react';
import { CategoryIcon } from '../../../components/assets/AssetBadges';
import { useCatalog } from '../../../context/CatalogContext';
import { Asset, AssetEntry } from '../../../types';
import { pluralize } from '../../../utils/strings';
import HandoverAssetCard, { AssetDraft } from './HandoverAssetCard';

type Filter = 'all' | 'changed';

interface HandoverCaseSectionsProps {
  assets: Asset[];
  drafts: Record<number, AssetDraft>;
  /** Категории, раскрытые снаружи (например, куда только что добавили новый кейс) */
  forceOpen?: string[];
  isTouched: (asset: Asset) => boolean;
  previousEntries: (assetId: number) => AssetEntry[];
  onChange: (assetId: number, draft: AssetDraft) => void;
}

const isChanged = (asset: Asset, draft?: AssetDraft) => !!draft && (draft.status !== asset.status || !!draft.text.trim());

const matches = (asset: Asset, needle: string) =>
  [asset.title, asset.description, asset.last_entry?.text ?? ''].some((text) => text.toLowerCase().includes(needle));

/**
 * Кейсы передачи, разложенные по категориям из настроек. Разделы свёрнуты: сотрудник открывает
 * только нужные, а в заголовке сразу видно, сколько кейсов и что в разделе уже отмечено.
 */
const HandoverCaseSections: React.FC<HandoverCaseSectionsProps> = ({ assets, drafts, forceOpen = [], isTouched, previousEntries, onChange }) => {
  const { categories, getCategory, isOpenStatus } = useCatalog();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const needle = query.trim().toLowerCase();
  const changedTotal = assets.filter((a) => isChanged(a, drafts[a.id])).length;

  const groups = useMemo(() => {
    const order = new Map(categories.map((c, i) => [c.key, i]));
    const byKey = new Map<string, Asset[]>();
    for (const asset of assets) {
      const list = byKey.get(asset.asset_type) ?? [];
      list.push(asset);
      byKey.set(asset.asset_type, list);
    }
    return [...byKey.entries()]
      .sort(([a], [b]) => (order.get(a) ?? 999) - (order.get(b) ?? 999))
      .map(([key, list]) => ({
        key,
        category: getCategory(key),
        // Сначала то, что трогали в эту смену, затем по названию
        assets: [...list].sort((a, b) => Number(isTouched(b)) - Number(isTouched(a)) || a.title.localeCompare(b.title, 'ru')),
      }));
  }, [assets, categories, getCategory, isTouched]);

  // При поиске и в режиме «изменённые» нужные разделы раскрываются сами
  const autoOpen = needle !== '' || filter === 'changed';
  const visible = (asset: Asset) => (!needle || matches(asset, needle)) && (filter === 'all' || isChanged(asset, drafts[asset.id]));
  const allOpen = groups.length > 0 && groups.every((g) => expanded.has(g.key));

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-2">
      {/* Панель: поиск по кейсам, «только изменённые», раскрыть/свернуть всё */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            aria-label="Найти кейс в передаче"
            placeholder="Найти кейс: номер, судно, текст"
            className="form-input !h-10 pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <div className="flex flex-1 rounded-xl bg-gray-100 p-1 sm:flex-none" role="radiogroup" aria-label="Какие кейсы показать">
            {([
              ['all', `Все ${assets.length}`],
              ['changed', `Изменённые ${changedTotal}`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={filter === key}
                onClick={() => setFilter(key)}
                className={clsx(
                  'flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium tabular-nums transition-colors',
                  filter === key ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setExpanded(allOpen ? new Set() : new Set(groups.map((g) => g.key)))}
            title={allOpen ? 'Свернуть все разделы' : 'Развернуть все разделы'}
            aria-label={allOpen ? 'Свернуть все разделы' : 'Развернуть все разделы'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900"
          >
            {allOpen ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {groups.map(({ key, category, assets: groupAssets }) => {
        const shown = groupAssets.filter(visible);
        if (autoOpen && shown.length === 0) return null;
        const open = autoOpen || expanded.has(key) || forceOpen.includes(key);
        const changed = groupAssets.filter((a) => isChanged(a, drafts[a.id])).length;
        const closing = groupAssets.filter((a) => {
          const status = drafts[a.id]?.status ?? a.status;
          return !isOpenStatus(status);
        }).length;
        const touched = groupAssets.filter(isTouched).length;
        const panelId = `handover-section-${key}`;

        return (
          <section key={key} className={clsx('rounded-xl border transition-colors', open ? 'border-gray-300' : 'border-gray-200')}>
            <h4>
              <button
                type="button"
                onClick={() => !autoOpen && toggle(key)}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-gray-50"
              >
                <CategoryIcon type={key} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-gray-900">{category.name}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {autoOpen && shown.length !== groupAssets.length
                      ? `найдено ${shown.length} из ${groupAssets.length}`
                      : `${groupAssets.length} ${pluralize(groupAssets.length, ['кейс', 'кейса', 'кейсов'])}`}
                    {touched > 0 && ` · ${touched} обновлялись в смену`}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  {changed > 0 && (
                    <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">отмечено {changed}</span>
                  )}
                  {closing > 0 && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">закрыто {closing}</span>
                  )}
                </span>
                <ChevronDown className={clsx('h-4 w-4 shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} aria-hidden />
              </button>
            </h4>

            <AnimatePresence initial={false}>
              {open && (
                <m.div
                  id={panelId}
                  key="panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <ul className="space-y-2 px-2 pb-2 sm:px-3 sm:pb-3">
                    {shown.map((asset) => (
                      <HandoverAssetCard
                        key={asset.id}
                        asset={asset}
                        draft={drafts[asset.id] ?? { status: asset.status, text: '' }}
                        touchedThisShift={isTouched(asset)}
                        previousEntries={previousEntries(asset.id)}
                        onChange={onChange}
                      />
                    ))}
                  </ul>
                </m.div>
              )}
            </AnimatePresence>
          </section>
        );
      })}

      {autoOpen && groups.every((g) => g.assets.filter(visible).length === 0) && (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500">
          {filter === 'changed' && !needle ? 'Пока ничего не отмечено' : 'Ничего не найдено'}
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
            className="inline-flex items-center gap-1 font-medium text-primary-600 hover:text-primary-700"
          >
            <X className="h-3.5 w-3.5" /> Сбросить
          </button>
        </p>
      )}
    </div>
  );
};

export default HandoverCaseSections;
