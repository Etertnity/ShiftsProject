import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ArrowLeftRight, Plus, Scissors, Trash2, UserRoundCog } from 'lucide-react';
import { shiftsApi } from '../../../api';
import Button from '../../../components/ui/Button';
import Field from '../../../components/ui/Field';
import IconButton from '../../../components/ui/IconButton';
import { Shift, UserPublic } from '../../../types';
import { addDays, formatDayShort } from '../../../utils/datetime';
import { getErrorMessage } from '../../../utils/errors';
import { formatShiftTime, shiftInterval, shiftTypeLabel } from '../../../utils/shifts';

type Action = 'assign' | 'swap' | 'split';

interface ShiftReplacePanelProps {
  shift: Shift;
  users: UserPublic[];
  /** Смены вокруг (для обмена) */
  shifts: Shift[];
  onDone: () => void;
}

interface PartRow {
  user_id: number;
  time: string; // HH:MM
}

const ACTIONS: { key: Action; label: string; hint: string; icon: React.ElementType }[] = [
  { key: 'assign', label: 'Заменить', hint: 'Другой сотрудник отработает всю смену', icon: UserRoundCog },
  { key: 'swap', label: 'Поменяться', hint: 'Рокировка с другой сменой', icon: ArrowLeftRight },
  { key: 'split', label: 'Разделить', hint: 'Смену отработали несколько человек', icon: Scissors },
];

const toTime = (date: Date) => date.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });

/**
 * Время части в пределах смены → "YYYY-MM-DDTHH:MM".
 * Для ночной смены время раньше начала относится к следующему дню.
 */
const partDateTime = (shift: Shift, time: string) => {
  const date = time < shift.start_time ? addDays(shift.date, 1) : shift.date;
  return `${date}T${time}`;
};

/** Замена дежурного, рокировка и разделение смены — для случаев, когда график поменялся по ходу. */
const ShiftReplacePanel: React.FC<ShiftReplacePanelProps> = ({ shift, users, shifts, onDone }) => {
  const [action, setAction] = useState<Action>(shift.segments.length ? 'split' : 'assign');
  const [assignTo, setAssignTo] = useState(0);
  const [swapWith, setSwapWith] = useState(0);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [saving, setSaving] = useState(false);

  const activeUsers = users.filter((u) => u.is_active);
  const { start, end } = shiftInterval(shift);

  useEffect(() => {
    setParts(
      shift.segments.length
        ? shift.segments.map((s) => ({ user_id: s.user_id, time: s.start_at.slice(11, 16) }))
        : [
            { user_id: shift.user_id, time: shift.start_time },
            // По умолчанию передача в середине смены
            { user_id: 0, time: toTime(new Date((start.getTime() + end.getTime()) / 2)) },
          ],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift.id]);

  // Для рокировки — смены других сотрудников в пределах недели
  const swapCandidates = useMemo(
    () =>
      shifts
        .filter((s) => s.id !== shift.id && s.user_id !== shift.user_id)
        .filter((s) => s.date >= addDays(shift.date, -7) && s.date <= addDays(shift.date, 7))
        .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)),
    [shifts, shift],
  );

  const run = async (request: () => Promise<unknown>, success: string) => {
    setSaving(true);
    try {
      await request();
      toast.success(success);
      onDone();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось сохранить изменения'));
    } finally {
      setSaving(false);
    }
  };

  // Проверка частей: время по порядку внутри смены, соседи — разные люди
  const splitError = (() => {
    if (parts.some((p) => !p.user_id)) return 'Выберите сотрудника для каждой части';
    for (let i = 1; i < parts.length; i += 1) {
      const prev = new Date(`${partDateTime(shift, parts[i - 1].time)}:00+03:00`);
      const cur = new Date(`${partDateTime(shift, parts[i].time)}:00+03:00`);
      if (i === 1 && parts[0].time !== shift.start_time) return 'Первая часть начинается с начала смены';
      if (!(cur > prev && cur < end)) return 'Время передачи должно идти по порядку внутри смены';
      if (parts[i].user_id === parts[i - 1].user_id) return 'Соседние части — за разными сотрудниками';
    }
    return null;
  })();

  const updatePart = (index: number, patch: Partial<PartRow>) => setParts((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2" role="tablist">
        {ACTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={action === key}
            onClick={() => setAction(key)}
            className={clsx(
              'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-sm font-medium transition-colors',
              action === key ? 'border-primary-400 bg-primary-50 text-primary-700 ring-2 ring-primary-400/30' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-500">{ACTIONS.find((a) => a.key === action)?.hint}</p>

      {action === 'assign' && (
        <div className="space-y-3">
          <Field label="Кто отработает смену" htmlFor="assign-user">
            <select id="assign-user" className="form-input" value={assignTo} onChange={(e) => setAssignTo(Number(e.target.value))}>
              <option value={0}>Выберите сотрудника</option>
              {activeUsers.filter((u) => u.id !== shift.user_id).map((u) => (
                <option key={u.id} value={u.id}>{u.name} — {u.position}</option>
              ))}
            </select>
          </Field>
          <Button fullWidth icon={UserRoundCog} loading={saving} disabled={!assignTo} onClick={() => run(() => shiftsApi.assign(shift.id, assignTo), 'Дежурный заменён')}>
            Заменить {shift.user_name}
          </Button>
        </div>
      )}

      {action === 'swap' && (
        <div className="space-y-3">
          {swapCandidates.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500">
              Рядом нет смен других сотрудников
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-1">
              {swapCandidates.map((s) => (
                <label
                  key={s.id}
                  className={clsx('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2', swapWith === s.id ? 'bg-primary-50' : 'hover:bg-gray-50')}
                >
                  <input type="radio" name="swap" className="h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500" checked={swapWith === s.id} onChange={() => setSwapWith(s.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{s.user_name}</span>
                    <span className="block text-xs text-gray-500">
                      {formatDayShort(s.date)}, {shiftTypeLabel(s).toLowerCase()} {formatShiftTime(s)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <Button fullWidth icon={ArrowLeftRight} loading={saving} disabled={!swapWith} onClick={() => run(() => shiftsApi.swap(shift.id, swapWith), 'Сотрудники поменялись сменами')}>
            Поменяться сменами
          </Button>
        </div>
      )}

      {action === 'split' && (
        <div className="space-y-3">
          <div className="space-y-2">
            {parts.map((part, index) => (
              <div key={index} className="flex items-end gap-2">
                <Field label={index === 0 ? 'С начала смены' : 'Затем'} className="min-w-0 flex-1">
                  <select className="form-input" value={part.user_id} onChange={(e) => updatePart(index, { user_id: Number(e.target.value) })}>
                    <option value={0}>Сотрудник</option>
                    {activeUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="с" className="w-28 shrink-0">
                  <input type="time" className="form-input" value={part.time} disabled={index === 0} onChange={(e) => updatePart(index, { time: e.target.value })} />
                </Field>
                <IconButton
                  icon={Trash2}
                  label="Убрать часть"
                  tone="danger"
                  className={clsx('mb-0.5', index < 2 && 'invisible')}
                  onClick={() => setParts((prev) => prev.filter((_, i) => i !== index))}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">Смена {formatShiftTime(shift)} — последняя часть длится до конца смены.</p>
          {parts.length < 6 && (
            <Button variant="ghost" size="sm" icon={Plus} onClick={() => setParts((prev) => [...prev, { user_id: 0, time: prev[prev.length - 1]?.time ?? shift.start_time }])}>
              Добавить передачу
            </Button>
          )}
          {splitError && <p className="text-sm text-red-600">{splitError}</p>}
          <div className="flex flex-col gap-2 xs:flex-row">
            {shift.segments.length > 0 && (
              <Button variant="secondary" fullWidth loading={saving} onClick={() => run(() => shiftsApi.split(shift.id, []), 'Смена снова за одним сотрудником')}>
                Убрать разделение
              </Button>
            )}
            <Button
              fullWidth
              icon={Scissors}
              loading={saving}
              disabled={!!splitError}
              onClick={() =>
                run(
                  () => shiftsApi.split(shift.id, parts.map((p) => ({ user_id: p.user_id, start_at: partDateTime(shift, p.time) }))),
                  'Смена разделена',
                )
              }
            >
              Сохранить разделение
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftReplacePanel;
