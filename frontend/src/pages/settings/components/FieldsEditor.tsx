import React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import Button from '../../../components/ui/Button';
import IconButton from '../../../components/ui/IconButton';
import { CategoryFieldInput, FieldType } from '../../../types';

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Строка' },
  { value: 'textarea', label: 'Текст (несколько строк)' },
  { value: 'number', label: 'Число' },
  { value: 'date', label: 'Дата' },
  { value: 'select', label: 'Выбор из списка' },
  { value: 'checkbox', label: 'Флажок (да/нет)' },
  { value: 'url', label: 'Ссылка' },
];

/** Поле в редакторе: локальный ключ нужен для React, пока у нового поля нет id. */
export type EditableField = CategoryFieldInput & { localKey: string; optionsText: string };

let counter = 0;
export const newField = (): EditableField => ({
  localKey: `new-${++counter}`,
  label: '',
  field_type: 'text',
  options: [],
  optionsText: '',
  placeholder: '',
  required: false,
  show_in_card: true,
});

interface FieldsEditorProps {
  fields: EditableField[];
  errors: Record<string, string>;
  onChange: (fields: EditableField[]) => void;
}

/** Конструктор полей категории: администратор сам решает, что заполнять по кейсу. */
const FieldsEditor: React.FC<FieldsEditorProps> = ({ fields, errors, onChange }) => {
  const update = (index: number, patch: Partial<EditableField>) =>
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  const move = (index: number, delta: number) => {
    const next = [...fields];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {fields.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500">
          Дополнительных полей нет — у актива будут только название, описание и статус.
        </p>
      )}

      {fields.map((field, index) => (
        <div key={field.localKey} className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
          <div className="flex items-start gap-2">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
              <div>
                <input
                  aria-label="Название поля"
                  className="form-input"
                  placeholder="Название поля, например «Номер тикета»"
                  value={field.label}
                  onChange={(e) => update(index, { label: e.target.value })}
                />
                {errors[field.localKey] && <p className="mt-1 text-xs text-red-600">{errors[field.localKey]}</p>}
              </div>
              <select
                aria-label="Тип поля"
                className="form-input"
                value={field.field_type}
                onChange={(e) => update(index, { field_type: e.target.value as FieldType })}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="flex shrink-0 flex-col xs:flex-row">
              <IconButton icon={ArrowUp} label="Выше" size="sm" disabled={index === 0} onClick={() => move(index, -1)} className="disabled:opacity-30" />
              <IconButton icon={ArrowDown} label="Ниже" size="sm" disabled={index === fields.length - 1} onClick={() => move(index, 1)} className="disabled:opacity-30" />
              <IconButton icon={Trash2} label="Удалить поле" tone="danger" size="sm" onClick={() => onChange(fields.filter((_, i) => i !== index))} />
            </div>
          </div>

          {field.field_type === 'select' && (
            <div>
              <textarea
                aria-label="Варианты"
                rows={3}
                className="form-input resize-y text-sm"
                placeholder={'Каждый вариант с новой строки\nP1 — критичный\nP2 — высокий'}
                value={field.optionsText}
                onChange={(e) => update(index, { optionsText: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-500">Каждый вариант — с новой строки</p>
            </div>
          )}

          {field.field_type !== 'checkbox' && (
            <input
              aria-label="Подсказка в поле"
              className="form-input text-sm"
              placeholder="Подсказка внутри поля (необязательно)"
              value={field.placeholder ?? ''}
              onChange={(e) => update(index, { placeholder: e.target.value })}
            />
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" checked={field.required} onChange={(e) => update(index, { required: e.target.checked })} />
              Обязательное
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" checked={field.show_in_card} onChange={(e) => update(index, { show_in_card: e.target.checked })} />
              Показывать в карточке
            </label>
          </div>
        </div>
      ))}

      <Button variant="secondary" size="sm" icon={Plus} onClick={() => onChange([...fields, newField()])}>
        Добавить поле
      </Button>
    </div>
  );
};

export default FieldsEditor;
