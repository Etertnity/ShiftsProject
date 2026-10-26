import React from 'react';
import clsx from 'clsx';
import { Eye, EyeOff } from 'lucide-react';
import { ContactVisibility } from '../../types';
import Field from '../ui/Field';

export interface ContactValues {
  name: string;
  position: string;
  phone: string;
  telegram_id: string;
  email: string;
}

interface ContactFieldsProps {
  idPrefix: string;
  values: ContactValues;
  errors: Partial<Record<keyof ContactValues, string>>;
  onChange: (key: keyof ContactValues, value: string) => void;
  /** Только в профиле: сотрудник сам решает, какие контакты видят коллеги */
  visibility?: ContactVisibility;
  onVisibilityChange?: (key: keyof ContactVisibility, value: boolean) => void;
}

interface VisibilityToggleProps {
  /** Что переключаем — для экранных дикторов */
  field: string;
  visible: boolean;
  onToggle: () => void;
}

/** Переключатель «Видно коллегам / Только администраторам» под полем контакта. */
const VisibilityToggle: React.FC<VisibilityToggleProps> = ({ field, visible, onToggle }) => {
  const Icon = visible ? Eye : EyeOff;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={visible}
      aria-label={`Показывать коллегам: ${field}`}
      title={visible ? 'Коллеги видят это поле. Нажмите, чтобы скрыть' : 'Видят только администраторы. Нажмите, чтобы показать коллегам'}
      onClick={onToggle}
      className={clsx(
        'mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
        visible ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {visible ? 'Видно коллегам' : 'Только администраторам'}
    </button>
  );
};

/** Общие поля сотрудника — используются и в админской форме, и в профиле. */
const ContactFields: React.FC<ContactFieldsProps> = ({ idPrefix, values, errors, onChange, visibility, onVisibilityChange }) => {
  const toggle = (key: keyof ContactVisibility, field: string) =>
    visibility && onVisibilityChange ? (
      <VisibilityToggle field={field} visible={visibility[key]} onToggle={() => onVisibilityChange(key, !visibility[key])} />
    ) : null;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Имя" htmlFor={`${idPrefix}-name`} required error={errors.name}>
          <input id={`${idPrefix}-name`} className="form-input" autoComplete="name" value={values.name} onChange={(e) => onChange('name', e.target.value)} />
        </Field>
        <Field label="Должность" htmlFor={`${idPrefix}-position`} required error={errors.position}>
          <input id={`${idPrefix}-position`} className="form-input" value={values.position} onChange={(e) => onChange('position', e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Телефон" htmlFor={`${idPrefix}-phone`}>
          <input id={`${idPrefix}-phone`} type="tel" inputMode="tel" autoComplete="tel" className="form-input" placeholder="+7 (999) 123-45-67" value={values.phone} onChange={(e) => onChange('phone', e.target.value)} />
          {toggle('show_phone', 'телефон')}
        </Field>
        <Field label="Telegram" htmlFor={`${idPrefix}-telegram`}>
          <input id={`${idPrefix}-telegram`} className="form-input" autoCapitalize="none" placeholder="username без @" value={values.telegram_id} onChange={(e) => onChange('telegram_id', e.target.value)} />
          {toggle('show_telegram', 'Telegram')}
        </Field>
      </div>
      <Field label="Email" htmlFor={`${idPrefix}-email`} error={errors.email}>
        <input id={`${idPrefix}-email`} type="email" inputMode="email" autoComplete="email" className="form-input" placeholder="user@example.com" value={values.email} onChange={(e) => onChange('email', e.target.value)} />
        {toggle('show_email', 'email')}
      </Field>
    </>
  );
};

export const validateContacts = (values: ContactValues): Partial<Record<keyof ContactValues, string>> => ({
  name: values.name.trim() ? undefined : 'Укажите имя',
  position: values.position.trim() ? undefined : 'Укажите должность',
  email: !values.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()) ? undefined : 'Некорректный email',
});

export default ContactFields;
