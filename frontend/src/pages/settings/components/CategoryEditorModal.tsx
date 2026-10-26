import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { settingsApi } from '../../../api';
import Button from '../../../components/ui/Button';
import Field from '../../../components/ui/Field';
import Modal from '../../../components/ui/Modal';
import { colorClasses, iconFor } from '../../../constants/palette';
import { Category, CategoryInput, ColorKey, IconKey } from '../../../types';
import { getErrorMessage } from '../../../utils/errors';
import FieldsEditor, { EditableField } from './FieldsEditor';
import { ColorPicker, IconPicker, Toggle } from './Pickers';

interface CategoryEditorModalProps {
  open: boolean;
  category: Category | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  name: string;
  description: string;
  color: ColorKey;
  icon: IconKey;
  is_active: boolean;
  auto_include_in_handover: boolean;
  fields: EditableField[];
}

const toForm = (category: Category | null): FormState =>
  category
    ? {
        name: category.name,
        description: category.description ?? '',
        color: category.color,
        icon: category.icon,
        is_active: category.is_active,
        auto_include_in_handover: category.auto_include_in_handover,
        fields: category.fields.map((f) => ({
          id: f.id,
          localKey: `f-${f.id}`,
          label: f.label,
          field_type: f.field_type,
          options: f.options,
          optionsText: f.options.join('\n'),
          placeholder: f.placeholder ?? '',
          required: f.required,
          show_in_card: f.show_in_card,
        })),
      }
    : { name: '', description: '', color: 'sky', icon: 'folder', is_active: true, auto_include_in_handover: false, fields: [] };

const CategoryEditorModal: React.FC<CategoryEditorModalProps> = ({ open, category, onClose, onSaved }) => {
  const [form, setForm] = useState<FormState>(toForm(null));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setForm(toForm(category));
  }, [open, category]);

  const fieldErrors: Record<string, string> = {};
  for (const field of form.fields) {
    if (!field.label.trim()) fieldErrors[field.localKey] = 'Укажите название поля';
    else if (field.field_type === 'select' && !field.optionsText.split('\n').some((o) => o.trim())) {
      fieldErrors[field.localKey] = 'Добавьте варианты выбора';
    }
  }
  const nameError = !form.name.trim() ? 'Укажите название' : undefined;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (nameError || Object.keys(fieldErrors).length > 0) return;

    const payload: CategoryInput = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      color: form.color,
      icon: form.icon,
      is_active: form.is_active,
      auto_include_in_handover: form.auto_include_in_handover,
      fields: form.fields.map((f) => ({
        id: f.id,
        label: f.label.trim(),
        field_type: f.field_type,
        options: f.field_type === 'select' ? f.optionsText.split('\n').map((o) => o.trim()).filter(Boolean) : [],
        placeholder: f.placeholder?.trim() || null,
        required: f.required,
        show_in_card: f.show_in_card,
      })),
    };
    setSaving(true);
    try {
      if (category) await settingsApi.updateCategory(category.id, payload);
      else await settingsApi.createCategory(payload);
      toast.success(category ? 'Категория сохранена' : 'Категория создана');
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось сохранить категорию'));
    } finally {
      setSaving(false);
    }
  };

  const PreviewIcon = iconFor(form.icon);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? 'Категория' : 'Новая категория'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" form="category-form" loading={saving}>Сохранить</Button>
        </>
      }
    >
      <form id="category-form" onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colorClasses(form.color).soft}`}>
            <PreviewIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{form.name || 'Название категории'}</p>
            <p className="truncate text-xs text-gray-500">{form.description || 'Так категория будет выглядеть в списках'}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Название" htmlFor="cat-name" required error={submitted ? nameError : undefined}>
            <input id="cat-name" className="form-input" autoFocus={!category} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например, Инциденты" />
          </Field>
          <Field label="Описание" htmlFor="cat-desc" hint="Подсказка сотрудникам: что относится к категории">
            <input id="cat-desc" className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Цвет">
            <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
          </Field>
          <Field label="Иконка">
            <IconPicker value={form.icon} color={form.color} onChange={(icon) => setForm({ ...form, icon })} />
          </Field>
        </div>

        <div className="space-y-3 rounded-xl border border-gray-200 p-3">
          <Toggle
            label="Категория активна"
            hint="Отключённую нельзя выбрать для новых активов, но старые сохраняются"
            checked={form.is_active}
            onChange={(value) => setForm({ ...form, is_active: value })}
          />
        </div>

        <section>
          <h3 className="font-semibold text-gray-900">Поля карточки</h3>
          <p className="mb-3 text-xs text-gray-500">
            Что сотрудник заполняет по активу этой категории: номер тикета, клиент, приоритет, дедлайн…
          </p>
          <FieldsEditor fields={form.fields} errors={submitted ? fieldErrors : {}} onChange={(fields) => setForm({ ...form, fields })} />
        </section>
      </form>
    </Modal>
  );
};

export default CategoryEditorModal;
