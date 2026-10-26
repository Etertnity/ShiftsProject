import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { assetsApi } from '../../../api';
import { CustomFieldsInputs, validateCustomFields } from '../../../components/assets/CustomFields';
import Button from '../../../components/ui/Button';
import Field from '../../../components/ui/Field';
import { useCatalog } from '../../../context/CatalogContext';
import { Asset, CustomFieldValues } from '../../../types';
import { getErrorMessage } from '../../../utils/errors';

interface QuickAssetFormProps {
  onCreated: (asset: Asset) => void;
  onCancel: () => void;
}

/** Новый кейс прямо из передачи смены — без перехода в раздел «Активы». */
const QuickAssetForm: React.FC<QuickAssetFormProps> = ({ onCreated, onCancel }) => {
  const { activeCategories, getCategory } = useCatalog();
  const [type, setType] = useState(activeCategories[0]?.key ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<CustomFieldValues>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const category = getCategory(type);
  const fieldErrors = validateCustomFields(category, fields);

  const submit = async () => {
    setSubmitted(true);
    if (!title.trim() || Object.keys(fieldErrors).length > 0) return;
    setSaving(true);
    try {
      const asset = await assetsApi.create({
        title: title.trim(),
        // Описание можно дописать позже — по умолчанию берём название
        description: description.trim() || title.trim(),
        asset_type: type,
        custom_fields: fields,
      });
      toast.success('Кейс создан и добавлен в передачу');
      onCreated(asset);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось создать кейс'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-primary-300 bg-primary-50/40 p-3">
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <Field label="Категория" htmlFor="quick-type">
          <select id="quick-type" className="form-input" value={type} onChange={(e) => { setType(e.target.value); setFields({}); }}>
            {activeCategories.map((c) => (
              <option key={c.key} value={c.key}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Название" htmlFor="quick-title" required error={submitted && !title.trim() ? 'Укажите название' : undefined}>
          <input id="quick-title" className="form-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, INC-1234: недоступен портал" />
        </Field>
      </div>
      <CustomFieldsInputs
        category={category}
        values={fields}
        errors={submitted ? fieldErrors : {}}
        onChange={(key, value) => setFields((prev) => ({ ...prev, [key]: value }))}
      />
      <Field label="Описание" htmlFor="quick-description">
        <textarea id="quick-description" rows={2} className="form-input resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Необязательно" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Отмена</Button>
        <Button size="sm" loading={saving} onClick={submit}>Создать кейс</Button>
      </div>
    </div>
  );
};

export default QuickAssetForm;
