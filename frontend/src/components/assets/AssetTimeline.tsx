import React from 'react';
import { ArrowRight, MessageSquare, Pencil, Plus, RefreshCw } from 'lucide-react';
import { useCatalog } from '../../context/CatalogContext';
import { AssetEntry } from '../../types';
import { formatDateTime, formatRelative } from '../../utils/datetime';
import { AssetStatusBadge } from './AssetBadges';

const KIND_ICONS = { created: Plus, comment: MessageSquare, status: RefreshCw, edit: Pencil } as const;

/** Короткая строка «что было последним» — для карточек и передачи смены. */
export const LastEntryLine: React.FC<{ entry?: AssetEntry | null; now?: Date }> = ({ entry, now }) => {
  const { getStatus } = useCatalog();
  if (!entry) return null;
  const summary =
    entry.text ||
    (entry.kind === 'status' && entry.new_status ? `Статус: ${getStatus(entry.new_status).name}` : entry.kind === 'created' ? 'Создан' : '');
  return (
    <p className="line-clamp-2 text-xs text-gray-500 [overflow-wrap:anywhere]">
      <span className="font-medium text-gray-600">{entry.author_name ?? 'Система'}</span>
      <span className="text-gray-400"> · {formatRelative(entry.created_at, now)}</span>
      {summary && <span>: {summary}</span>}
    </p>
  );
};

/** Лента истории актива — от новых к старым. */
const AssetTimeline: React.FC<{ entries: AssetEntry[] }> = ({ entries }) => {
  if (entries.length === 0) {
    return <p className="py-4 text-center text-sm text-gray-500">Записей пока нет</p>;
  }
  return (
    <ol className="relative space-y-4 border-l border-gray-200 pl-5">
      {entries.map((entry) => {
        const Icon = KIND_ICONS[entry.kind as keyof typeof KIND_ICONS] ?? MessageSquare;
        return (
          <li key={entry.id} className="relative">
            <span className="absolute -left-[1.95rem] top-0 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-surface text-gray-500">
              <Icon className="h-3 w-3" aria-hidden />
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
              <span className="font-semibold text-gray-800">{entry.author_name ?? 'Система'}</span>
              <span title={formatDateTime(entry.created_at)}>{formatRelative(entry.created_at)}</span>
              {entry.handover_id && <span className="rounded bg-primary-50 px-1.5 py-0.5 text-primary-700">передача #{entry.handover_id}</span>}
            </div>
            {entry.kind === 'status' && entry.new_status && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {entry.old_status && <AssetStatusBadge status={entry.old_status} />}
                <ArrowRight className="h-3 w-3 text-gray-400" aria-hidden />
                <AssetStatusBadge status={entry.new_status} />
              </div>
            )}
            {entry.kind === 'created' && <p className="mt-1 text-sm text-gray-600">Актив создан</p>}
            {entry.text && <p className="mt-1 text-sm text-gray-700 text-wrap-force">{entry.text}</p>}
          </li>
        );
      })}
    </ol>
  );
};

export default AssetTimeline;
