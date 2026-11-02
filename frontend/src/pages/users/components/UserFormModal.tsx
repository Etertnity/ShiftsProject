import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { usersApi } from '../../../api';
import ContactFields, { ContactValues, validateContacts } from '../../../components/users/ContactFields';
import Button from '../../../components/ui/Button';
import Field from '../../../components/ui/Field';
import Modal from '../../../components/ui/Modal';
import { PASSWORD_MIN_LENGTH } from '../../../constants/navigation';
import { UserAdmin, Wave, WAVE_LABELS } from '../../../types';
import { getErrorMessage } from '../../../utils/errors';

interface UserFormModalProps {
  open: boolean;
  user: UserAdmin | null;
  isSelf: boolean;
  onClose: () => void;
  onSaved: (user: UserAdmin) => void;
}

interface FormState extends ContactValues {
  username: string;
  password: string;
  is_admin: boolean;
  is_active: boolean;
  wave: Wave;
}

const EMPTY: FormState = {
  username: '', password: '', name: '', position: '', phone: '', telegram_id: '', email: '', is_admin: false, is_active: true, wave: 1,
};

const WAVE_HINTS: Record<Wave, string> = {
  1: 'Сменные день/ночь: передают дела следующей смене',
  2: 'Дневные «2 через 2»: передают друг другу каждый вечер в 21:00',
};

/**
 * Форма администратора. При создании задаётся логин и временный пароль (сотрудник сменит его при входе).
 * При редактировании текущий логин не показывается — можно только задать новый.
 */
const UserFormModal: React.FC<UserFormModalProps> = ({ open, user, isSelf, onClose, onSaved }) => {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setForm(
      user
        ? {
            ...EMPTY,
            name: user.name,
            position: user.position,
            phone: user.phone ?? '',
            telegram_id: user.telegram_id ?? '',
            email: user.email ?? '',
            is_admin: user.is_admin,
            is_active: user.is_active,
            wave: user.wave ?? 1,
          }
        : EMPTY,
    );
  }, [open, user]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const errors = {
    ...validateContacts(form),
    username: !user && !form.username.trim() ? 'Укажите логин' : undefined,
    password: !user && form.password.length < PASSWORD_MIN_LENGTH ? `Минимум ${PASSWORD_MIN_LENGTH} символов` : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasErrors) return;

    const contacts = {
      name: form.name.trim(),
      position: form.position.trim(),
      phone: form.phone.trim(),
      telegram_id: form.telegram_id.trim().replace(/^@/, ''),
      email: form.email.trim(),
      is_admin: form.is_admin,
      wave: form.wave,
    };
    setSaving(true);
    try {
      const saved = user
        ? await usersApi.update(user.id, { ...contacts, username: form.username.trim() || undefined, is_active: form.is_active })
        : await usersApi.create({ ...contacts, username: form.username.trim(), password: form.password });
      toast.success(user ? 'Сотрудник обновлён' : 'Сотрудник добавлен — при первом входе он сменит пароль');
      onSaved(saved);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось сохранить сотрудника'));
    } finally {
      setSaving(false);
    }
  };

  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={user ? 'Редактировать сотрудника' : 'Новый сотрудник'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" form="user-form" loading={saving}>{user ? 'Сохранить' : 'Добавить'}</Button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} className="space-y-4" noValidate autoComplete="off">
        {user ? (
          <Field label="Новый логин" htmlFor="user-username" hint="Текущий логин скрыт. Заполните, только если нужно его заменить">
            <input id="user-username" className="form-input" autoCapitalize="none" autoComplete="off" value={form.username} onChange={(e) => set('username', e.target.value)} />
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Логин" htmlFor="user-username" required error={shown('username')}>
              <input id="user-username" className="form-input" autoCapitalize="none" autoComplete="off" value={form.username} onChange={(e) => set('username', e.target.value)} />
            </Field>
            <Field label="Временный пароль" htmlFor="user-password" required error={shown('password')} hint="Сотрудник сменит его при первом входе">
              <input id="user-password" type="password" className="form-input" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} />
            </Field>
          </div>
        )}

        <ContactFields idPrefix="user" values={form} errors={submitted ? errors : {}} onChange={(key, value) => set(key, value)} />

        <Field label="Волна передачи смен" hint={WAVE_HINTS[form.wave]}>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label="Волна передачи смен">
            {([1, 2] as Wave[]).map((wave) => (
              <button
                key={wave}
                type="button"
                role="radio"
                aria-checked={form.wave === wave}
                onClick={() => set('wave', wave)}
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  form.wave === wave ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900',
                )}
              >
                {WAVE_LABELS[wave]}
              </button>
            ))}
          </div>
        </Field>

        <div className="space-y-2 rounded-xl border border-gray-200 p-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
              checked={form.is_admin}
              disabled={isSelf}
              onChange={(e) => set('is_admin', e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Администратор</span>
              <span className="block text-xs text-gray-500">{isSelf ? 'Нельзя снять права с самого себя' : 'Видит контакты сотрудников и управляет настройками'}</span>
            </span>
          </label>
          {user && (
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
                checked={form.is_active}
                disabled={isSelf}
                onChange={(e) => set('is_active', e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">Доступ разрешён</span>
                <span className="block text-xs text-gray-500">Отключённый сотрудник не сможет войти</span>
              </span>
            </label>
          )}
        </div>
      </form>
    </Modal>
  );
};

export default UserFormModal;
