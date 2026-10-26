import React from 'react';
import Field from '../../../components/ui/Field';
import { AssetSort, UserPublic } from '../../../types';
import { addDays, todayKey } from '../../../utils/datetime';

export type PeriodPreset = '' | 'today' | 'week' | 'month' | 'stale' | 'custom';

export interface ExtraFilters {
  period: PeriodPreset;
  from: string;
  to: string;
  /** '' — все, иначе id сотрудника */
  author: string;
  sort: AssetSort;
}

export const DEFAULT_EXTRA: ExtraFilters = { period: '', from: '', to: '', author: '', sort: 'updated_desc' };

export const SORT_OPTIONS: { value: AssetSort; label: string }[] = [
  { value: 'updated_desc', label: 'Сначала недавно обновлённые' },
  { value: 'updated_asc', label: 'Сначала давно не обновлявшиеся' },
  { value: 'created_desc', label: 'Сначала новые' },
  { value: 'created_asc', label: 'Сначала старые' },
  { value: 'title', label: 'По названию' },
];

/** Период → границы для API. «Без движения» — кейсы, которые не обновлялись больше недели. */
export const periodRange = ({ period, from, to }: ExtraFilters): { updated_from?: string; updated_to?: string } => {
  const today = todayKey();
  switch (period) {
    case 'today':
      return { updated_from: today };
    case 'week':
      return { updated_from: addDays(today, -6) };
    case 'month':
      return { updated_from: addDays(today, -29) };
    case 'stale':
      return { updated_to: addDays(today, -8) };
    case 'custom':
      return { updated_from: from || undefined, updated_to: to || undefined };
    default:
      return {};
  }
};

/** Сколько дополнительных фильтров отличается от значений по умолчанию — для счётчика на кнопке. */
export const activeExtraCount = (filters: ExtraFilters) =>
  Number(filters.period !== '') + Number(filters.author !== '') + Number(filters.sort !== DEFAULT_EXTRA.sort);

interface AssetExtraFiltersProps {
  value: ExtraFilters;
  users: UserPublic[];
  currentUserId: number;
  onChange: (value: ExtraFilters) => void;
}

/** Дополнительные фильтры кейсов: когда обновлялся, кто работал, сортировка. */
const AssetExtraFilters: React.FC<AssetExtraFiltersProps> = ({ value, users, currentUserId, onChange }) => {
  const set = (patch: Partial<ExtraFilters>) => onChange({ ...value, ...patch });
  const colleagues = users.filter((u) => u.is_active && u.id !== currentUserId);

  return (
    <div className="grid gap-3 border-t border-gray-100 pt-3 sm:grid-cols-3">
      <Field label="Обновлялся" htmlFor="filter-period">
        <select id="filter-period" className="form-input" value={value.period} onChange={(e) => set({ period: e.target.value as PeriodPreset })}>
          <option value="">Когда угодно</option>
          <option value="today">Сегодня</option>
          <option value="week">За 7 дней</option>
          <option value="month">За 30 дней</option>
          <option value="stale">Без движения больше недели</option>
          <option value="custom">Свой период…</option>
        </select>
      </Field>
      <Field label="Кто работал" htmlFor="filter-author" hint="Есть записи в истории кейса">
        <select id="filter-author" className="form-input" value={value.author} onChange={(e) => set({ author: e.target.value })}>
          <option value="">Все сотрудники</option>
          <option value={String(currentUserId)}>Я</option>
          {colleagues.map((u) => (
            <option key={u.id} value={String(u.id)}>{u.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Сортировка" htmlFor="filter-sort">
        <select id="filter-sort" className="form-input" value={value.sort} onChange={(e) => set({ sort: e.target.value as AssetSort })}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>
      {value.period === 'custom' && (
        <div className="grid grid-cols-2 gap-3 sm:col-span-3 sm:max-w-md">
          <Field label="С" htmlFor="filter-from">
            <input id="filter-from" type="date" className="form-input min-w-0" value={value.from} max={value.to || undefined} onChange={(e) => set({ from: e.target.value })} />
          </Field>
          <Field label="По" htmlFor="filter-to">
            <input id="filter-to" type="date" className="form-input min-w-0" value={value.to} min={value.from || undefined} onChange={(e) => set({ to: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  );
};

export default AssetExtraFilters;
