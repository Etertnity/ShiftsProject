import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { assetsApi } from '../../../api';
import { CustomFieldsInputs, validateCustomFields } from '../../../components/assets/CustomFields';
import StatusChips from '../../../components/assets/StatusChips';
import Button from '../../../components/ui/Button';
import DraftBanner from '../../../components/ui/DraftBanner';
import Field from '../../../components/ui/Field';
import Modal from '../../../components/ui/Modal';
import { colorClasses, iconFor } from '../../../constants/palette';
import { useCurrentUser } from '../../../context/AuthContext';
import { useCatalog } from '../../../context/CatalogContext';
import { useDraft } from '../../../hooks/useDraft';
import { Asset, CustomFieldValues } from '../../../types';
import { getErrorMessage } from '../../../utils/errors';

interface AssetFormModalProps {
  open: boolean;
  asset: Asset | null;
  /** Категория по умолчанию для нового актива (например, выбранная в фильтре) */
  defaultCategory?: string;
  onClose: () => void;
  onSaved: (asset: Asset) => void;
}

interface FormState {
  title: string;
  description: string;
  asset_type: string;
  status: string;
  custom_fields: CustomFieldValues;
}

const AssetFormModal: React.FC<AssetFormModalProps> = ({ open, asset, defaultCategory, onClose, onSaved }) => {
  const user = useCurrentUser();
  const { activeCategories, getCategory, defaultStatus } = useCatalog();
  const [form, setForm] = useState<FormState | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  // Черновик — только для нового актива: у существующего есть история изменений
  const draftKey = open && !asset ? `asset:new:${user.id}` : null;
  const { restored, clear, dismiss } = useDraft(draftKey, form, !!form && !!(form.title || form.description));

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setForm(
      asset
        ? { title: asset.title, description: asset.description, asset_type: asset.asset_type, status: asset.status, custom_fields: { ...asset.custom_fields } }
        : {
            title: '',
            description: '',
            asset_type: defaultCategory || activeCategories[0]?.key || '',
            status: defaultStatus?.key ?? '',
            custom_fields: {},
          },
    );
  }, [open, asset, defaultCategory, activeCategories, defaultStatus]);

  // Категории для выбора: активные + текущая (даже если её уже отключили)
  const categoryOptions = useMemo(() => {
    if (!form) return activeCategories;
    const current = getCategory(form.asset_type);
    return current.is_active || current.id === -1 ? activeCategories : [...activeCategories, current];
  }, [activeCategories, form, getCategory]);

  if (!form) return null;

  const category = getCategory(form.asset_type);
  const fieldErrors = validateCustomFields(category, form.custom_fields);
  const errors = {
    title: !form.title.trim() ? 'Укажите название' : undefined,
    description: !form.description.trim() ? 'Добавьте описание' : undefined,
  };
  const hasErrors = !!errors.title || !!errors.description || Object.keys(fieldErrors).length > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasErrors) return;

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      asset_type: form.asset_type,
      status: form.status,
      custom_fields: form.custom_fields,
    };
    setSaving(true);
    try {
      const saved = asset ? await assetsApi.update(asset.id, payload) : await assetsApi.create(payload);
      toast.success(asset ? 'Актив обновлён' : 'Актив создан');
      clear();
      onSaved(saved);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось сохранить актив'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={asset ? 'Редактировать актив' : 'Новый актив'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" form="asset-form" loading={saving}>{asset ? 'Сохранить' : 'Создать'}</Button>
        </>
      }
    >
      <form id="asset-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        {restored && (
          <DraftBanner
            savedAt={restored.savedAt}
            onRestore={() => {
              setForm(restored.value as FormState);
              dismiss();
            }}
            onDiscard={clear}
          />
        )}

        <Field label="Категория" required>
          <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">
            {categoryOptions.map((option) => {
              const Icon = iconFor(option.icon);
              const selected = option.key === form.asset_type;
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setForm({ ...form, asset_type: option.key })}
                  className={clsx(
                    'flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                    selected ? 'border-primary-400 bg-primary-50 ring-2 ring-primary-400/30' : 'border-gray-200 hover:bg-gray-50',
                  )}
                >
                  <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', colorClasses(option.color).soft)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="truncate font-medium text-gray-900">{option.name}</span>
                </button>
              );
            })}
          </div>
          {category.description && <p className="mt-1.5 text-xs text-gray-500">{category.description}</p>}
        </Field>

        <Field label="Название" htmlFor="asset-title" required error={submitted ? errors.title : undefined}>
          <input
            id="asset-title"
            className="form-input"
            placeholder="Например, CASE-10234: падение VPN"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            autoFocus={!asset}
          />
        </Field>

        <CustomFieldsInputs
          category={category}
          values={form.custom_fields}
          errors={submitted ? fieldErrors : {}}
          onChange={(key, value) => setForm({ ...form, custom_fields: { ...form.custom_fields, [key]: value } })}
        />

        <Field label="Описание" htmlFor="asset-description" required error={submitted ? errors.description : undefined}>
          <textarea
            id="asset-description"
            rows={5}
            className="form-input min-h-[7rem] resize-y leading-relaxed"
            placeholder="Суть проблемы и контекст. Ход работ записывайте в историю — по сменам."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>

        <Field label="Статус">
          <StatusChips value={form.status} onChange={(status) => setForm({ ...form, status })} />
        </Field>
      </form>
    </Modal>
  );
};

export default AssetFormModal;
