import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Category, CategoryField, CustomFieldValues } from '../../types';
import Field from '../ui/Field';

const formatValue = (field: CategoryField, value: string | number | boolean): string => {
  if (field.field_type === 'checkbox') return value ? 'Да' : 'Нет';
  if (field.field_type === 'date' && typeof value === 'string') {
    const [y, m, d] = value.split('-');
    return d && m && y ? `${d}.${m}.${y}` : value;
  }
  return String(value);
};

const hasValue = (value: unknown) => value !== undefined && value !== null && value !== '';

/** Значения полей категории: компактные «ярлыки» в карточке или список в подробностях. */
export const CustomFieldsView: React.FC<{
  category: Category;
  values: CustomFieldValues;
  compact?: boolean;
}> = ({ category, values, compact }) => {
  const fields = category.fields.filter((f) => hasValue(values[f.key]) && (!compact || f.show_in_card));
  if (fields.length === 0) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {fields.map((field) => (
          <span key={field.key} className="inline-flex max-w-full items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
            <span className="shrink-0 text-gray-400">{field.label}:</span>
            <span className="truncate font-medium text-gray-700">{formatValue(field, values[field.key])}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <dl className="grid gap-x-4 gap-y-2 rounded-xl bg-gray-50 p-3 text-sm sm:grid-cols-2">
      {fields.map((field) => {
        const value = values[field.key];
        const text = formatValue(field, value);
        return (
          <div key={field.key} className="min-w-0">
            <dt className="text-xs text-gray-500">{field.label}</dt>
            <dd className="font-medium text-gray-900 [overflow-wrap:anywhere]">
              {field.field_type === 'url' && /^https?:\/\//i.test(text) ? (
                <a href={text} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700">
                  <span className="truncate">{text.replace(/^https?:\/\//i, '')}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <span className="whitespace-pre-wrap">{text}</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
};

/** Поля ввода для полей категории — форма собирается автоматически из настроек администратора. */
export const CustomFieldsInputs: React.FC<{
  category: Category;
  values: CustomFieldValues;
  errors?: Record<string, string>;
  onChange: (key: string, value: string | boolean) => void;
}> = ({ category, values, errors = {}, onChange }) => {
  if (category.fields.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {category.fields.map((field) => {
        const id = `cf-${field.key}`;
        const value = values[field.key];
        const wide = field.field_type === 'textarea';
        if (field.field_type === 'checkbox') {
          return (
            <label key={field.key} className="flex items-center gap-3 self-end rounded-xl border border-gray-200 px-3 py-2.5 sm:col-span-1">
              <input
                id={id}
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                checked={!!value}
                onChange={(e) => onChange(field.key, e.target.checked)}
              />
              <span className="text-sm font-medium text-gray-700">
                {field.label}
                {field.required && <span className="ml-0.5 text-red-500">*</span>}
              </span>
            </label>
          );
        }
        const common = {
          id,
          className: 'form-input',
          placeholder: field.placeholder ?? undefined,
          value: value === undefined || value === null ? '' : String(value),
        };
        return (
          <Field
            key={field.key}
            label={field.label}
            htmlFor={id}
            required={field.required}
            error={errors[field.key]}
            className={wide ? 'sm:col-span-2' : undefined}
          >
            {field.field_type === 'textarea' ? (
              <textarea {...common} rows={3} className="form-input resize-y" onChange={(e) => onChange(field.key, e.target.value)} />
            ) : field.field_type === 'select' ? (
              <select {...common} onChange={(e) => onChange(field.key, e.target.value)}>
                <option value="">Не выбрано</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                {...common}
                type={field.field_type === 'number' ? 'text' : field.field_type === 'url' ? 'url' : field.field_type === 'date' ? 'date' : 'text'}
                inputMode={field.field_type === 'number' ? 'decimal' : undefined}
                onChange={(e) => onChange(field.key, e.target.value)}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
};

/** Проверка обязательных полей на клиенте — чтобы подсветить их до отправки. */
export const validateCustomFields = (category: Category, values: CustomFieldValues): Record<string, string> => {
  const errors: Record<string, string> = {};
  for (const field of category.fields) {
    const value = values[field.key];
    if (field.required && (field.field_type === 'checkbox' ? !value : !hasValue(value) || String(value).trim() === '')) {
      errors[field.key] = 'Обязательное поле';
    } else if (field.field_type === 'number' && hasValue(value) && Number.isNaN(Number(String(value).replace(',', '.')))) {
      errors[field.key] = 'Нужно число';
    }
  }
  return errors;
};
