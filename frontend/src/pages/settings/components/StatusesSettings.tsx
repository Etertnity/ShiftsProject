import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { settingsApi } from '../../../api';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import IconButton from '../../../components/ui/IconButton';
import { colorClasses } from '../../../constants/palette';
import { useCatalog } from '../../../context/CatalogContext';
import { ColorKey, StatusOption } from '../../../types';
import { getErrorMessage } from '../../../utils/errors';
import { ColorPicker } from './Pickers';

interface Row {
  localKey: string;
  id?: number;
  name: string;
  color: ColorKey;
  is_closed: boolean;
  is_default: boolean;
  asset_count: number;
}

let counter = 0;
const toRows = (statuses: StatusOption[]): Row[] =>
  statuses.map((s) => ({ localKey: `s-${s.id}`, id: s.id, name: s.name, color: s.color, is_closed: s.is_closed, is_default: s.is_default, asset_count: s.asset_count }));

/** Список статусов редактируется целиком и сохраняется одной кнопкой. */
const StatusesSettings: React.FC = () => {
  const { statuses, reload } = useCatalog();
  const [rows, setRows] = useState<Row[]>(() => toRows(statuses));
  const [colorOpen, setColorOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setRows(toRows(statuses)), [statuses]);

  const dirty = JSON.stringify(rows.map(({ localKey, asset_count, ...r }) => r)) !==
    JSON.stringify(toRows(statuses).map(({ localKey, asset_count, ...r }) => r));

  const update = (index: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const setDefault = (index: number) => setRows((prev) => prev.map((r, i) => ({ ...r, is_default: i === index })));

  const move = (index: number, delta: number) =>
    setRows((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });

  const errors = (() => {
    if (rows.some((r) => !r.name.trim())) return 'У каждого статуса должно быть название';
    if (rows.every((r) => r.is_closed)) return 'Нужен хотя бы один открытый статус';
    const def = rows.find((r) => r.is_default);
    if (def?.is_closed) return 'Статус по умолчанию должен быть открытым';
    return null;
  })();

  const save = async () => {
    if (errors) return;
    setSaving(true);
    try {
      await settingsApi.saveStatuses(rows.map((r) => ({ id: r.id, name: r.name.trim(), color: r.color, is_closed: r.is_closed, is_default: r.is_default })));
      toast.success('Статусы сохранены');
      await reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось сохранить статусы'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Закрытые статусы считаются завершёнными: такие активы не попадают в передачу смены и по умолчанию скрыты в списке.
      </p>

      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.localKey} className="card p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Выбрать цвет"
                title="Цвет"
                onClick={() => setColorOpen(colorOpen === row.localKey ? null : row.localKey)}
                className={clsx('h-7 w-7 shrink-0 rounded-full ring-offset-2 hover:ring-2 hover:ring-gray-300', colorClasses(row.color).dot)}
              />
              <input
                aria-label="Название статуса"
                className="form-input min-w-0 flex-1 py-2"
                value={row.name}
                onChange={(e) => update(index, { name: e.target.value })}
              />
              <IconButton icon={ArrowUp} label="Выше" size="sm" disabled={index === 0} onClick={() => move(index, -1)} className="disabled:opacity-30" />
              <IconButton icon={ArrowDown} label="Ниже" size="sm" disabled={index === rows.length - 1} onClick={() => move(index, 1)} className="disabled:opacity-30" />
              <IconButton
                icon={Trash2}
                label={row.asset_count > 0 ? 'Используется в активах — удалить нельзя' : 'Удалить'}
                tone="danger"
                size="sm"
                disabled={row.asset_count > 0}
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                className="disabled:opacity-30"
              />
            </div>
            {colorOpen === row.localKey && (
              <div className="mt-3">
                <ColorPicker value={row.color} onChange={(color) => { update(index, { color }); setColorOpen(null); }} />
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 pl-9 text-sm text-gray-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" checked={row.is_closed} onChange={(e) => update(index, { is_closed: e.target.checked })} />
                Закрытый
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="default-status" className="h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500" checked={row.is_default} onChange={() => setDefault(index)} />
                По умолчанию
              </label>
              {row.asset_count > 0 && <Badge>{row.asset_count} в активах</Badge>}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="secondary"
          size="sm"
          icon={Plus}
          onClick={() => setRows((prev) => [...prev, { localKey: `new-${++counter}`, name: '', color: 'slate', is_closed: false, is_default: false, asset_count: 0 }])}
        >
          Добавить статус
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {errors && <p className="text-sm text-red-600">{errors}</p>}
          {dirty && <Button variant="ghost" size="sm" onClick={() => setRows(toRows(statuses))}>Отменить изменения</Button>}
          <Button size="sm" loading={saving} disabled={!dirty || !!errors} onClick={save}>Сохранить статусы</Button>
        </div>
      </div>
    </div>
  );
};

export default StatusesSettings;
