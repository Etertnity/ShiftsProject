import React from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { colorClasses } from '../../constants/palette';
import { useCatalog } from '../../context/CatalogContext';

interface StatusChipsProps {
  value: string;
  /** Текущий статус актива — помечается, чтобы было видно, что меняется */
  current?: string;
  onChange: (status: string) => void;
  size?: 'sm' | 'md';
}

/** Выбор статуса одним нажатием — быстрее выпадающего списка, особенно на телефоне. */
const StatusChips: React.FC<StatusChipsProps> = ({ value, current, onChange, size = 'md' }) => {
  const { statuses } = useCatalog();
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Статус">
      {statuses.map((status) => {
        const selected = status.key === value;
        const colors = colorClasses(status.color);
        return (
          <button
            key={status.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(status.key)}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full border font-medium transition-all',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              selected
                ? clsx(colors.badge, 'border-transparent ring-2 ring-inset')
                : 'border-gray-200 bg-surface text-gray-600 hover:border-gray-300 hover:bg-gray-50',
            )}
          >
            {selected ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span className={clsx('h-1.5 w-1.5 rounded-full', colors.dot)} aria-hidden />}
            {status.name}
            {current === status.key && !selected && <span className="text-[10px] uppercase tracking-wide text-gray-400">сейчас</span>}
          </button>
        );
      })}
    </div>
  );
};

export default StatusChips;
