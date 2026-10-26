import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { authApi } from '../../api';
import { PASSWORD_MIN_LENGTH } from '../../constants/navigation';
import { tokenStorage } from '../../utils/tokenStorage';
import { getErrorMessage } from '../../utils/errors';
import Button from '../ui/Button';
import Field from '../ui/Field';

interface ChangePasswordFormProps {
  onChanged: () => void;
  /** Подпись поля текущего пароля (для временного пароля от администратора) */
  currentLabel?: string;
}

/** Смена пароля: текущий + новый дважды. Используется в профиле и при обязательной смене. */
const ChangePasswordForm: React.FC<ChangePasswordFormProps> = ({ onChanged, currentLabel = 'Текущий пароль' }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = {
    current: !current ? 'Введите пароль' : undefined,
    next: next.length < PASSWORD_MIN_LENGTH ? `Минимум ${PASSWORD_MIN_LENGTH} символов` : next === current ? 'Должен отличаться от текущего' : undefined,
    repeat: repeat !== next ? 'Пароли не совпадают' : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasErrors) return;
    setSaving(true);
    try {
      const { access_token: token } = await authApi.changePassword({ current_password: current, new_password: next });
      // Старые сессии закрыты сервером — продолжаем работу с новым токеном
      tokenStorage.set(token);
      toast.success('Пароль изменён');
      setCurrent('');
      setNext('');
      setRepeat('');
      setSubmitted(false);
      onChanged();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось сменить пароль'));
    } finally {
      setSaving(false);
    }
  };

  const type = visible ? 'text' : 'password';
  const shown = (key: keyof typeof errors) => (submitted ? errors[key] : undefined);

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field label={currentLabel} htmlFor="pwd-current" error={shown('current')}>
        <input id="pwd-current" type={type} autoComplete="current-password" className="form-input" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Новый пароль" htmlFor="pwd-new" error={shown('next')} hint={`Не короче ${PASSWORD_MIN_LENGTH} символов`}>
          <input id="pwd-new" type={type} autoComplete="new-password" className="form-input" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Повторите пароль" htmlFor="pwd-repeat" error={shown('repeat')}>
          <input id="pwd-repeat" type={type} autoComplete="new-password" className="form-input" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-2 xs:flex-row xs:items-center xs:justify-between">
        <button type="button" onClick={() => setVisible((v) => !v)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {visible ? 'Скрыть пароли' : 'Показать пароли'}
        </button>
        <Button type="submit" icon={KeyRound} loading={saving}>Сменить пароль</Button>
      </div>
    </form>
  );
};

export default ChangePasswordForm;
