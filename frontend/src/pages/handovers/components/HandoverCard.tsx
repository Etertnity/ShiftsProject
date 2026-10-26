import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowRight, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { AssetStatusBadge, CategoryIcon } from '../../../components/assets/AssetBadges';
import IconButton from '../../../components/ui/IconButton';
import { useCatalog } from '../../../context/CatalogContext';
import { Asset, AssetEntry, Handover, Shift } from '../../../types';
import { formatDateTime, formatDayShort } from '../../../utils/datetime';
import { formatShiftTime } from '../../../utils/shifts';
import { pluralize } from '../../../utils/strings';

interface HandoverCardProps {
  handover: Handover;
  shiftsById: Map<number, Shift>;
  onEdit: (handover: Handover) => void;
  /** Только для администратора */
  onDelete?: (handover: Handover) => void;
  onOpenAsset: (asset: Asset) => void;
}

const ShiftInfo: React.FC<{ label: string; shiftId?: number | null; shiftsById: Map<number, Shift>; fallbackName?: string | null }> = ({
  label,
  shiftId,
  shiftsById,
  fallbackName,
}) => {
  const shift = shiftId ? shiftsById.get(shiftId) : undefined;
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      {shift ? (
        <>
          <p className="truncate text-sm font-semibold text-gray-900">{shift.user_name}</p>
          <p className="truncate text-xs text-gray-500">{formatDayShort(shift.date)}, {formatShiftTime(shift)}</p>
        </>
      ) : fallbackName ? (
        // Смены нет в графике (например, передача загружена из Excel) — показываем автора записей
        <p className="truncate text-sm font-semibold text-gray-900">{fallbackName}</p>
      ) : (
        <p className="text-sm text-gray-500">{shiftId ? 'Смена удалена' : 'Не указана'}</p>
      )}
    </div>
  );
};

const NO_ENTRIES: AssetEntry[] = [];

/** Строка кейса в карточке передачи: что записали в эту передачу и смена статуса. */
const CaseRow: React.FC<{ asset: Asset; entries: AssetEntry[]; onOpen: (asset: Asset) => void }> = ({ asset, entries, onOpen }) => {
  const statusEntry = [...entries].reverse().find((e) => e.kind === 'status');
  const notes = entries.map((e) => e.text).filter(Boolean);
  const statusBadges =
    statusEntry?.old_status && statusEntry.new_status ? (
      <span className="flex flex-wrap items-center gap-1">
        <AssetStatusBadge status={statusEntry.old_status} />
        <ArrowRight className="h-3 w-3 text-gray-400" aria-hidden />
        <AssetStatusBadge status={statusEntry.new_status} />
      </span>
    ) : (
      <AssetStatusBadge status={asset.status} />
    );
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(asset)}
        className="flex w-full min-w-0 items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-gray-50"
      >
        <CategoryIcon type={asset.asset_type} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900">{asset.title}</span>
          {notes.length > 0 ? (
            <span className="block text-xs text-gray-600 [overflow-wrap:anywhere]">{notes.join(' · ')}</span>
          ) : (
            !statusEntry && <span className="block text-xs text-gray-400">без изменений</span>
          )}
          {/* На узких экранах статус — под названием, чтобы не отнимать ширину у текста */}
          <span className="mt-1 flex sm:hidden">{statusBadges}</span>
        </span>
        <span className="hidden shrink-0 sm:flex">{statusBadges}</span>
      </button>
    </li>
  );
};

/**
 * Кейсы передачи по категориям. Разделы свёрнуты (в передаче бывает 70+ кейсов),
 * в заголовке — сколько кейсов, сколько с записями и сколько закрыто в эту смену.
 */
const CaseGroups: React.FC<{ handover: Handover; onOpenAsset: (asset: Asset) => void }> = ({ handover, onOpenAsset }) => {
  const { categories, getCategory, isOpenStatus } = useCatalog();
  // Маленькую передачу показываем сразу раскрытой — сворачивать нечего
  const [open, setOpen] = useState<Set<string>>(() => (handover.assets.length <= 5 ? new Set(handover.assets.map((a) => a.asset_type)) : new Set()));
  // Записи по кейсам и группы считаем один раз на передачу, а не фильтром для каждой строки
  const { entriesByAsset, sorted } = useMemo(() => {
    const order = new Map(categories.map((c, i) => [c.key, i]));
    const byAsset = new Map<number, AssetEntry[]>();
    for (const entry of handover.entries) byAsset.set(entry.asset_id, [...(byAsset.get(entry.asset_id) ?? []), entry]);
    const groups = new Map<string, Asset[]>();
    for (const asset of handover.assets) groups.set(asset.asset_type, [...(groups.get(asset.asset_type) ?? []), asset]);
    return {
      entriesByAsset: byAsset,
      sorted: [...groups.entries()].sort(([a], [b]) => (order.get(a) ?? 999) - (order.get(b) ?? 999)),
    };
  }, [handover, categories]);
  const entriesOf = (assetId: number) => entriesByAsset.get(assetId) ?? NO_ENTRIES;

  return (
    <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-4">
      {sorted.map(([key, assets]) => {
        // Сначала кейсы с записями в эту передачу
        const list = [...assets].sort(
          (a, b) => Number(entriesOf(b.id).length > 0) - Number(entriesOf(a.id).length > 0) || a.title.localeCompare(b.title, 'ru'),
        );
        const updated = assets.filter((a) => entriesOf(a.id).length > 0).length;
        const closed = assets.filter((a) => entriesOf(a.id).some((e) => e.new_status && !isOpenStatus(e.new_status))).length;
        const isOpen = open.has(key);
        return (
          <section key={key} className="rounded-xl bg-gray-50/70">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-gray-100"
            >
              <CategoryIcon type={key} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                {getCategory(key).name}
                <span className="ml-1.5 font-normal text-gray-500">
                  {assets.length} {pluralize(assets.length, ['кейс', 'кейса', 'кейсов'])}
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">
                {updated > 0 && <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">записей {updated}</span>}
                {closed > 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">закрыто {closed}</span>}
              </span>
              <ChevronDown className={clsx('h-4 w-4 shrink-0 text-gray-400 transition-transform', isOpen && 'rotate-180')} aria-hidden />
            </button>
            {isOpen && (
              <ul className="space-y-0.5 px-1 pb-1">
                {list.map((asset) => (
                  <CaseRow key={asset.id} asset={asset} entries={entriesOf(asset.id)} onOpen={onOpenAsset} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
};

const NOTES_PREVIEW_LIMIT = 280;

const HandoverCard: React.FC<HandoverCardProps> = ({ handover, shiftsById, onEdit, onDelete, onOpenAsset }) => {
  const [expanded, setExpanded] = useState(false);
  const longNotes = handover.handover_notes.length > NOTES_PREVIEW_LIMIT || handover.handover_notes.split('\n').length > 6;

  return (
    <article className="card p-4 sm:p-5">
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900">Передача #{handover.id}</h3>
          <p className="text-xs text-gray-500">{formatDateTime(handover.created_at)}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <IconButton icon={Pencil} label="Редактировать" tone="primary" size="sm" onClick={() => onEdit(handover)} />
          {onDelete && <IconButton icon={Trash2} label="Удалить" tone="danger" size="sm" onClick={() => onDelete(handover)} />}
        </div>
      </header>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <ShiftInfo
          label="Сдаёт"
          shiftId={handover.from_shift_id}
          shiftsById={shiftsById}
          fallbackName={handover.entries.find((e) => e.author_name)?.author_name}
        />
        <ArrowRight className="hidden h-4 w-4 shrink-0 text-gray-300 sm:block" aria-hidden />
        <ArrowDown className="mx-auto h-4 w-4 shrink-0 text-gray-300 sm:hidden" aria-hidden />
        <ShiftInfo label="Принимает" shiftId={handover.to_shift_id} shiftsById={shiftsById} />
      </div>

      <div className="mt-4">
        <p className={`text-sm leading-relaxed text-gray-700 text-wrap-force ${!expanded && longNotes ? 'line-clamp-6' : ''}`}>
          {handover.handover_notes}
        </p>
        {longNotes && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 text-sm font-medium text-primary-600 hover:text-primary-700">
            {expanded ? 'Свернуть' : 'Показать полностью'}
          </button>
        )}
      </div>

      {handover.assets.length > 0 && <CaseGroups handover={handover} onOpenAsset={onOpenAsset} />}
    </article>
  );
};

export default HandoverCard;
