import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowDown, ArrowUp, Moon, Sun, Wand2, X } from 'lucide-react';
import { shiftsApi } from '../../../api';
import Avatar from '../../../components/ui/Avatar';
import Button from '../../../components/ui/Button';
import Field from '../../../components/ui/Field';
import IconButton from '../../../components/ui/IconButton';
import Modal from '../../../components/ui/Modal';
import Spinner from '../../../components/ui/Spinner';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { ScheduleGenerateResult, UserPublic } from '../../../types';
import { formatDayShort } from '../../../utils/datetime';
import { getErrorMessage } from '../../../utils/errors';
import { pluralize, shortName } from '../../../utils/strings';

interface ScheduleGeneratorModalProps {
  open: boolean;
  users: UserPublic[];
  defaultFrom: string;
  defaultTo: string;
  onClose: () => void;
  onApplied: () => void;
}

/**
 * Автозаполнение графика по циклу «день → ночь → отсыпной → выходной».
 * Порядок сотрудников задаёт очередь: первый выходит в день начала периода, второй — днём позже…
 */
const ScheduleGeneratorModal: React.FC<ScheduleGeneratorModalProps> = ({ open, users, defaultFrom, defaultTo, onClose, onApplied }) => {
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [order, setOrder] = useState<number[]>([]);
  const [mode, setMode] = useState<'fill' | 'replace'>('fill');
  const [preview, setPreview] = useState<ScheduleGenerateResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);

  const activeUsers = useMemo(() => users.filter((u) => u.is_active), [users]);
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  useEffect(() => {
    if (!open) return;
    setDateFrom(defaultFrom);
    setDateTo(defaultTo);
    setMode('fill');
    setPreview(null);
    // По умолчанию в ротации первые четыре активных сотрудника
    setOrder(activeUsers.slice(0, 4).map((u) => u.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const params = useMemo(() => ({ date_from: dateFrom, date_to: dateTo, user_ids: order, mode }), [dateFrom, dateTo, order, mode]);
  const debounced = useDebouncedValue(params, 350);
  const valid = !!dateFrom && !!dateTo && dateTo >= dateFrom && order.length >= 3;

  // Предпросмотр пересчитывается сам при любом изменении — ничего не сохраняя
  useEffect(() => {
    if (!open || !valid) {
      setPreview(null);
      return undefined;
    }
    let cancelled = false;
    setLoadingPreview(true);
    shiftsApi
      .generate({ ...debounced, preview: true })
      .then((result) => {
        if (!cancelled) {
          setPreview(result);
          setPreviewError(null);
        }
      })
      .catch((error) => !cancelled && setPreviewError(getErrorMessage(error, 'Не удалось построить график')))
      .finally(() => !cancelled && setLoadingPreview(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, open]);

  const toggle = (id: number) => setOrder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const move = (index: number, delta: number) =>
    setOrder((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });

  const apply = async () => {
    setApplying(true);
    try {
      const result = await shiftsApi.generate({ ...params, preview: false });
      toast.success(`Создано ${result.created} ${pluralize(result.created, ['смена', 'смены', 'смен'])}`);
      onApplied();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось заполнить график'));
    } finally {
      setApplying(false);
    }
  };

  // Предпросмотр по дням: кто днём, кто ночью
  const days = useMemo(() => {
    const map = new Map<string, { day?: string; night?: string }>();
    for (const s of preview?.shifts ?? []) {
      const row = map.get(s.date) ?? {};
      row[s.shift_type === 'night' ? 'night' : 'day'] = s.user_name;
      map.set(s.date, row);
    }
    return Array.from(map.entries());
  }, [preview]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Автозаполнение графика"
      description="Цикл: день → ночь → отсыпной → выходной"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button
            icon={Wand2}
            loading={applying}
            disabled={!valid || !preview || loadingPreview || preview.shifts.length === 0}
            variant={mode === 'replace' ? 'danger' : 'primary'}
            onClick={apply}
          >
            {preview ? `Создать ${preview.shifts.length} ${pluralize(preview.shifts.length, ['смену', 'смены', 'смен'])}` : 'Создать'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="С" htmlFor="gen-from">
              <input id="gen-from" type="date" className="form-input min-w-0" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </Field>
            <Field label="По" htmlFor="gen-to">
              <input id="gen-to" type="date" className="form-input min-w-0" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </Field>
          </div>

          <Field label={`Очередь ротации · ${order.length}`} hint="Первый выходит в день начала периода, следующий — днём позже">
            <ol className="space-y-1.5">
              {order.map((id, index) => {
                const user = byId.get(id);
                if (!user) return null;
                return (
                  <li key={id} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-surface px-2 py-1.5">
                    <span className="w-5 text-center text-xs font-semibold text-gray-400">{index + 1}</span>
                    <Avatar name={user.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{user.name}</span>
                    <IconButton icon={ArrowUp} label="Раньше" size="sm" disabled={index === 0} onClick={() => move(index, -1)} className="disabled:opacity-30" />
                    <IconButton icon={ArrowDown} label="Позже" size="sm" disabled={index === order.length - 1} onClick={() => move(index, 1)} className="disabled:opacity-30" />
                    <IconButton icon={X} label="Убрать из ротации" size="sm" tone="danger" onClick={() => toggle(id)} />
                  </li>
                );
              })}
            </ol>
            {activeUsers.some((u) => !order.includes(u.id)) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {activeUsers.filter((u) => !order.includes(u.id)).map((u) => (
                  <button key={u.id} type="button" onClick={() => toggle(u.id)} className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:border-primary-400 hover:text-primary-700">
                    + {u.name}
                  </button>
                ))}
              </div>
            )}
            {order.length < 3 && <p className="mt-2 text-sm text-red-600">Нужно минимум три сотрудника</p>}
          </Field>

          <Field label="Если в периоде уже есть смены">
            <div className="grid gap-2 xs:grid-cols-2">
              {([
                ['fill', 'Заполнить пустые', 'Существующие смены останутся'],
                ['replace', 'Построить заново', 'Смены периода будут удалены'],
              ] as const).map(([value, title, hint]) => (
                <label key={value} className={clsx('flex cursor-pointer gap-2 rounded-xl border px-3 py-2', mode === value ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:bg-gray-50')}>
                  <input type="radio" name="gen-mode" className="mt-0.5 h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500" checked={mode === value} onChange={() => setMode(value)} />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{title}</span>
                    <span className="block text-xs text-gray-500">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <span className="form-label mb-0">Предпросмотр</span>
            {loadingPreview && <Spinner size="sm" />}
          </div>
          {previewError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{previewError}</p>
          ) : !preview ? (
            <p className="rounded-xl border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500">Выберите период и сотрудников</p>
          ) : (
            <div className="space-y-2">
              {(preview.warnings.length > 0 || preview.removed > 0) && (
                <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {preview.removed > 0 && (
                    <p className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Будет удалено смен: {preview.removed}</p>
                  )}
                  {preview.warnings.map((w) => (
                    <p key={w} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</p>
                  ))}
                </div>
              )}
              {preview.skipped > 0 && <p className="text-xs text-gray-500">Пропущено занятых слотов: {preview.skipped}</p>}
              <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-200 lg:max-h-[26rem]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Дата</th>
                      <th className="px-3 py-2 text-left font-medium"><Sun className="inline h-3.5 w-3.5 text-amber-500" /> День</th>
                      <th className="px-3 py-2 text-left font-medium"><Moon className="inline h-3.5 w-3.5 text-indigo-500" /> Ночь</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {days.map(([date, row]) => (
                      <tr key={date}>
                        <td className="whitespace-nowrap px-3 py-1.5 text-gray-500 first-letter:uppercase">{formatDayShort(date)}</td>
                        <td className="truncate px-3 py-1.5 text-gray-900">{row.day ? shortName(row.day) : <span className="text-gray-300">—</span>}</td>
                        <td className="truncate px-3 py-1.5 text-gray-900">{row.night ? shortName(row.night) : <span className="text-gray-300">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ScheduleGeneratorModal;
