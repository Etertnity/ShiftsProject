import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Moon, Sun, Trash2 } from 'lucide-react';
import { shiftsApi } from '../../../api';
import Avatar from '../../../components/ui/Avatar';
import Button from '../../../components/ui/Button';
import Field from '../../../components/ui/Field';
import Modal from '../../../components/ui/Modal';
import { ContactButtons, hasContacts } from '../../../components/users/ContactLinks';
import { useCurrentUser } from '../../../context/AuthContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { CreateShift, Shift, ShiftType, UserPublic } from '../../../types';
import { formatDayShort } from '../../../utils/datetime';
import { getErrorMessage } from '../../../utils/errors';
import { formatPartTime, formatParts, SHIFT_PRESETS, shiftParts } from '../../../utils/shifts';
import { pluralize } from '../../../utils/strings';
import ShiftReplacePanel from './ShiftReplacePanel';

export type ShiftFormMode = 'create' | 'bulk' | 'edit';

interface ShiftFormModalProps {
  open: boolean;
  mode: ShiftFormMode;
  date: string;
  shift?: Shift | null;
  users: UserPublic[];
  /** Смены месяца — для рокировки */
  shifts?: Shift[];
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  date: string;
  shift_type: ShiftType;
  start_time: string;
  end_time: string;
  user_id: number;
  notes: string;
}

const emptyForm = (date: string): FormState => ({
  date,
  shift_type: 'day',
  start_time: SHIFT_PRESETS.day.start,
  end_time: SHIFT_PRESETS.day.end,
  user_id: 0,
  notes: '',
});

const TITLES: Record<ShiftFormMode, string> = {
  create: 'Новая смена',
  bulk: 'Несколько смен',
  edit: 'Смена',
};

/** Кто дежурит на смене и как с ним связаться (только контакты, открытые коллегам). */
const ShiftContacts: React.FC<{ shift: Shift; users: UserPublic[] }> = ({ shift, users }) => {
  const me = useCurrentUser();
  const parts = shiftParts(shift)
    .map((part) => ({ part, user: users.find((u) => u.id === part.user_id) }))
    .filter(({ part, user }) => part.user_id !== me.id && user && hasContacts(user));
  if (parts.length === 0) return null;
  return (
    <ul className="mb-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
      {parts.map(({ part, user }) => (
        <li key={`${part.user_id}-${part.start.getTime()}`} className="flex items-center gap-3 px-3 py-2">
          <Avatar name={part.user_name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">{part.user_name}</p>
            <p className="text-xs text-gray-500">{formatPartTime(part)}</p>
          </div>
          <ContactButtons contacts={user!} name={part.user_name} />
        </li>
      ))}
    </ul>
  );
};

const ShiftFormModal: React.FC<ShiftFormModalProps> = ({ open, mode, date, shift, users, shifts = [], onClose, onSaved }) => {
  const confirm = useConfirm();
  const [form, setForm] = useState<FormState>(emptyForm(date));
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'details' | 'replace'>('details');

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setSelectedUsers([]);
    setTab('details');
    if (mode === 'edit' && shift) {
      // Тип берём из самой смены, а не угадываем по времени начала, и не перетираем её время пресетом
      setForm({
        date: shift.date,
        shift_type: shift.shift_type === 'night' ? 'night' : 'day',
        start_time: shift.start_time,
        end_time: shift.end_time,
        user_id: shift.user_id,
        notes: shift.notes ?? '',
      });
    } else {
      setForm(emptyForm(date));
    }
  }, [open, mode, shift, date]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const changeType = (type: ShiftType) =>
    setForm((prev) => ({ ...prev, shift_type: type, start_time: SHIFT_PRESETS[type].start, end_time: SHIFT_PRESETS[type].end }));

  const toggleUser = (id: number) =>
    setSelectedUsers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const errors = {
    date: !form.date ? 'Укажите дату' : undefined,
    user: mode === 'bulk' ? (selectedUsers.length === 0 ? 'Выберите хотя бы одного сотрудника' : undefined) : !form.user_id ? 'Выберите сотрудника' : undefined,
    time: !form.start_time || !form.end_time ? 'Укажите время' : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasErrors) return;

    const payload: CreateShift = {
      date: form.date,
      shift_type: form.shift_type,
      start_time: form.start_time,
      end_time: form.end_time,
      user_id: form.user_id,
      notes: form.notes.trim() || undefined,
    };

    setSaving(true);
    try {
      if (mode === 'edit' && shift) {
        await shiftsApi.update(shift.id, payload);
        toast.success('Смена обновлена');
      } else if (mode === 'bulk') {
        await shiftsApi.createMultiple(selectedUsers.map((user_id) => ({ ...payload, user_id })));
        toast.success(`Создано ${selectedUsers.length} ${pluralize(selectedUsers.length, ['смена', 'смены', 'смен'])}`);
      } else {
        await shiftsApi.create(payload);
        toast.success('Смена создана');
      }
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось сохранить смену'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!shift) return;
    const ok = await confirm({
      title: 'Удалить смену?',
      message: `${shift.user_name}, ${formatDayShort(shift.date)} ${shift.start_time}–${shift.end_time}`,
    });
    if (!ok) return;
    try {
      await shiftsApi.delete(shift.id);
      toast.success('Смена удалена');
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось удалить смену'));
    }
  };

  const submitLabel =
    mode === 'edit'
      ? 'Сохранить'
      : mode === 'bulk' && selectedUsers.length > 0
        ? `Создать ${selectedUsers.length} ${pluralize(selectedUsers.length, ['смену', 'смены', 'смен'])}`
        : 'Создать';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={TITLES[mode]}
      description={mode === 'edit' && shift ? `${formatDayShort(shift.date)} · ${shift.segments.length ? formatParts(shift) : shift.user_name}` : undefined}
      footer={
        tab === 'replace' ? (
          <Button variant="secondary" onClick={onClose}>Закрыть</Button>
        ) : (
        <>
          {mode === 'edit' && (
            <Button variant="ghost" icon={Trash2} onClick={handleDelete} className="text-red-600 hover:bg-red-50 hover:text-red-700 sm:mr-auto">
              Удалить
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" form="shift-form" loading={saving}>{submitLabel}</Button>
        </>
        )
      }
    >
      {mode === 'edit' && shift && <ShiftContacts shift={shift} users={users} />}
      {mode === 'edit' && shift && (
        <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
          {([
            ['details', 'Параметры'],
            ['replace', 'Замена и подмена'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={clsx(
                'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                tab === key ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {mode === 'edit' && shift && tab === 'replace' ? (
        <ShiftReplacePanel shift={shift} users={users} shifts={shifts} onDone={onSaved} />
      ) : (
      <form id="shift-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Тип смены">
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(['day', 'night'] as ShiftType[]).map((type) => {
              const active = form.shift_type === type;
              const Icon = type === 'day' ? Sun : Moon;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`${SHIFT_PRESETS[type].label} ${SHIFT_PRESETS[type].start}–${SHIFT_PRESETS[type].end}`}
                  onClick={() => changeType(type)}
                  className={clsx(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    active
                      ? type === 'day' ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-400/30' : 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-400/30'
                      : 'border-gray-300 hover:bg-gray-50',
                  )}
                >
                  <Icon className={clsx('h-5 w-5 shrink-0', type === 'day' ? 'text-amber-500' : 'text-indigo-500')} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900">{SHIFT_PRESETS[type].label}</span>
                    <span className="block text-xs text-gray-500">{SHIFT_PRESETS[type].start}–{SHIFT_PRESETS[type].end}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Дата" htmlFor="shift-date" required error={submitted ? errors.date : undefined}>
          <input id="shift-date" type="date" className="form-input" value={form.date} onChange={(e) => update('date', e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Начало" htmlFor="shift-start" error={submitted ? errors.time : undefined}>
            <input id="shift-start" type="time" className="form-input" value={form.start_time} onChange={(e) => update('start_time', e.target.value)} />
          </Field>
          <Field label="Конец" htmlFor="shift-end">
            <input id="shift-end" type="time" className="form-input" value={form.end_time} onChange={(e) => update('end_time', e.target.value)} />
          </Field>
        </div>

        {mode === 'bulk' ? (
          <Field label={`Сотрудники${selectedUsers.length ? ` · выбрано ${selectedUsers.length}` : ''}`} required error={submitted ? errors.user : undefined}>
            <div className="max-h-60 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-300">
              {users.map((user) => (
                <label key={user.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    checked={selectedUsers.includes(user.id)}
                    onChange={() => toggleUser(user.id)}
                  />
                  <Avatar name={user.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">{user.name}</span>
                    <span className="block truncate text-xs text-gray-500">{user.position}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
        ) : (
          <Field label="Сотрудник" htmlFor="shift-user" required error={submitted ? errors.user : undefined}>
            <select id="shift-user" className="form-input" value={form.user_id} onChange={(e) => update('user_id', Number(e.target.value))}>
              <option value={0}>Выберите сотрудника</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} — {user.position}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Комментарий" htmlFor="shift-notes">
          <textarea
            id="shift-notes"
            rows={2}
            className="form-input resize-y"
            placeholder="Необязательно"
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
          />
        </Field>
      </form>
      )}
    </Modal>
  );
};

export default ShiftFormModal;
