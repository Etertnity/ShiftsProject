import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { handoversApi } from '../../../api';
import Button from '../../../components/ui/Button';
import DraftBanner from '../../../components/ui/DraftBanner';
import Field from '../../../components/ui/Field';
import Modal from '../../../components/ui/Modal';
import { useCurrentUser } from '../../../context/AuthContext';
import { useCatalog } from '../../../context/CatalogContext';
import { useDraft } from '../../../hooks/useDraft';
import { Asset, AssetEntry, Handover, Shift } from '../../../types';
import { addDays, parseServerDate, todayKey } from '../../../utils/datetime';
import { getErrorMessage } from '../../../utils/errors';
import { findActiveShifts, findNextShift, formatShiftLabel, shiftInterval, sortShifts } from '../../../utils/shifts';
import { pluralize } from '../../../utils/strings';
import { AssetDraft } from './HandoverAssetCard';
import HandoverCaseSections from './HandoverCaseSections';
import QuickAssetForm from './QuickAssetForm';

interface HandoverFormModalProps {
  open: boolean;
  handover: Handover | null;
  shifts: Shift[];
  assets: Asset[];
  /** Последняя передача: кейсы, закрытые после неё, попадают в новую передачу последний раз */
  lastHandover?: Handover | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  fromShiftId: number | '';
  toShiftId: number | '';
  notes: string;
  included: number[];
  drafts: Record<number, AssetDraft>;
}

// Готовые фразы для общих наблюдений — часто смена проходит штатно, и писать это вручную незачем
const QUICK_PHRASES = ['Смена прошла штатно', 'Алертов мониторинга не было', 'Новых обращений нет', 'Есть вопросы — позвоните'];

const EMPTY_NOTES_FALLBACK = 'Без общих замечаний';
const NO_ENTRIES: AssetEntry[] = [];

const HandoverFormModal: React.FC<HandoverFormModalProps> = ({ open, handover, shifts, assets, lastHandover, onClose, onSaved }) => {
  const user = useCurrentUser();
  const { isOpenStatus } = useCatalog();
  const [form, setForm] = useState<FormState | null>(null);
  const [createdAssets, setCreatedAssets] = useState<Asset[]>([]);
  const [suggestedId, setSuggestedId] = useState<number | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const allAssets = useMemo(() => [...createdAssets, ...assets.filter((a) => !createdAssets.some((c) => c.id === a.id))], [assets, createdAssets]);
  const assetsById = useMemo(() => new Map(allAssets.map((a) => [a.id, a])), [allAssets]);

  const draftKey = open ? (handover ? `handover:${handover.id}:${user.id}` : `handover:new:${user.id}`) : null;
  const hasContent =
    !!form &&
    (!!form.notes.trim() ||
      Object.entries(form.drafts).some(([id, d]) => d.text.trim() || d.status !== assetsById.get(Number(id))?.status));
  const { restored, clear, dismiss } = useDraft(draftKey, form, hasContent);

  const draftFor = (asset: Asset): AssetDraft => ({ status: asset.status, text: '' });

  // Инициализация при открытии
  useEffect(() => {
    if (!open) return;
    setCreatedAssets([]);
    setQuickOpen(false);

    if (handover) {
      setSuggestedId(null);
      setForm({
        fromShiftId: handover.from_shift_id ?? '',
        toShiftId: handover.to_shift_id ?? '',
        notes: handover.handover_notes,
        included: handover.assets.map((a) => a.id),
        drafts: Object.fromEntries(handover.assets.map((a) => [a.id, draftFor(assetsById.get(a.id) ?? a)])),
      });
      return;
    }

    // Новая передача: сдаёт текущая смена, принимает следующая по графику
    const active = findActiveShifts(shifts)[0];
    const next = active ? findNextShift(active, shifts) : null;
    const shiftStart = active ? shiftInterval(active).start : null;
    // В передачу попадают все открытые кейсы. Кейсы, закрытые после прошлой передачи (например, со страницы
    // активов), попадают сюда последний раз — чтобы закрытие было записано в журнале смены
    const since = lastHandover ? parseServerDate(lastHandover.created_at) : shiftStart;
    const closedInLast = new Set(
      (lastHandover?.entries ?? []).filter((e) => e.new_status && !isOpenStatus(e.new_status)).map((e) => e.asset_id),
    );
    const included = assets
      .filter(
        (a) =>
          isOpenStatus(a.status) ||
          (!!since && parseServerDate(a.updated_at) > since && !closedInLast.has(a.id)),
      )
      .map((a) => a.id);

    setSuggestedId(next?.id ?? null);
    setForm({
      fromShiftId: active?.id ?? '',
      toShiftId: next?.id ?? '',
      notes: '',
      included,
      drafts: Object.fromEntries(included.map((id) => [id, draftFor(assetsById.get(id)!)])),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, handover]);

  const fromShift = form?.fromShiftId ? shifts.find((s) => s.id === form.fromShiftId) : undefined;
  const shiftStart = fromShift ? shiftInterval(fromShift).start : null;

  // В списках смен — последняя неделя и ближайшие дни, плюс уже выбранные
  const shiftOptions = useMemo(() => {
    const today = todayKey();
    const from = addDays(today, -7);
    const to = addDays(today, 3);
    const keep = new Set([form?.fromShiftId, form?.toShiftId].filter(Boolean));
    return sortShifts(shifts.filter((s) => (s.date >= from && s.date <= to) || keep.has(s.id))).reverse();
  }, [shifts, form?.fromShiftId, form?.toShiftId]);

  // Обновлялся ли кейс в сдающую смену (число — чтобы функция не пересоздавалась на каждом рендере)
  const shiftStartMs = shiftStart?.getTime() ?? null;
  const touched = useCallback(
    (asset: Asset) =>
      shiftStartMs !== null && !!asset.last_entry && parseServerDate(asset.last_entry.created_at).getTime() >= shiftStartMs,
    [shiftStartMs],
  );

  // Записи этой передачи по кейсам — один раз, а не фильтром по всем записям для каждой карточки
  const entriesByAsset = useMemo(() => {
    const map = new Map<number, AssetEntry[]>();
    for (const entry of handover?.entries ?? []) map.set(entry.asset_id, [...(map.get(entry.asset_id) ?? []), entry]);
    return map;
  }, [handover]);
  const previousEntries = useCallback((assetId: number) => entriesByAsset.get(assetId) ?? NO_ENTRIES, [entriesByAsset]);

  // Стабильная функция: карточки кейсов мемоизированы и не перерисовываются, когда печатают в соседней
  const updateDraft = useCallback(
    (assetId: number, draft: AssetDraft) => setForm((prev) => prev && { ...prev, drafts: { ...prev.drafts, [assetId]: draft } }),
    [],
  );

  if (!form) return null;

  const includedAssets = form.included.map((id) => assetsById.get(id)).filter((a): a is Asset => !!a);
  const changedCount = includedAssets.filter((a) => {
    const d = form.drafts[a.id];
    return d && (d.status !== a.status || d.text.trim());
  }).length;

  const include = (asset: Asset) =>
    setForm((prev) => prev && {
      ...prev,
      included: [...prev.included, asset.id],
      drafts: { ...prev.drafts, [asset.id]: prev.drafts[asset.id] ?? draftFor(asset) },
    });

  const handleFromChange = (value: string) => {
    const id = value ? Number(value) : '';
    const from = id ? shifts.find((s) => s.id === id) : undefined;
    const next = from ? findNextShift(from, shifts) : null;
    setSuggestedId(next?.id ?? null);
    // Подсказываем принимающую смену только когда пользователь сам меняет сдающую
    setForm((prev) => prev && { ...prev, fromShiftId: id, toShiftId: next ? next.id : prev.toShiftId });
  };

  const addPhrase = (phrase: string) =>
    setForm((prev) => prev && { ...prev, notes: prev.notes.trim() ? `${prev.notes.trimEnd()}\n${phrase}` : phrase });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updates = includedAssets
        .map((asset) => ({ asset, draft: form.drafts[asset.id] }))
        .filter(({ asset, draft }) => draft && (draft.status !== asset.status || draft.text.trim()))
        .map(({ asset, draft }) => ({
          asset_id: asset.id,
          status: draft.status !== asset.status ? draft.status : undefined,
          text: draft.text.trim() || undefined,
        }));
      const payload = {
        from_shift_id: form.fromShiftId || null,
        to_shift_id: form.toShiftId || null,
        handover_notes: form.notes.trim() || EMPTY_NOTES_FALLBACK,
        asset_ids: includedAssets.map((a) => a.id),
        updates,
      };
      if (handover) {
        await handoversApi.update(handover.id, payload);
        toast.success('Передача обновлена');
      } else {
        await handoversApi.create(payload);
        toast.success('Смена передана');
      }
      clear();
      onSaved();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось сохранить передачу'));
    } finally {
      setSaving(false);
    }
  };

  const renderShiftSelect = (id: string, value: number | '', onChange: (value: string) => void, highlightId?: number | null) => (
    <select id={id} className="form-input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Не указана</option>
      {shiftOptions.map((shift) => (
        <option key={shift.id} value={shift.id}>
          {formatShiftLabel(shift)}
          {shift.id === highlightId ? ' ★' : ''}
        </option>
      ))}
    </select>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={handover ? `Передача #${handover.id}` : 'Передать смену'}
      description={handover ? 'Новые отметки добавятся к истории кейсов' : 'Отметьте, что изменилось по кейсам, — остальное заполнено'}
      size="xl"
      footer={
        <>
          <span className="hidden text-sm text-gray-500 sm:mr-auto sm:block">
            {changedCount > 0 ? `Обновлено ${changedCount} из ${includedAssets.length}` : 'Изменений по кейсам нет'}
          </span>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" form="handover-form" loading={saving}>
            {handover ? 'Сохранить' : 'Передать смену'}
          </Button>
        </>
      }
    >
      <form id="handover-form" onSubmit={handleSubmit} className="space-y-6" noValidate>
        {restored && (
          <DraftBanner
            savedAt={restored.savedAt}
            onRestore={() => {
              const value = restored.value as FormState;
              // Кейсы, которых уже нет (удалены), из черновика не восстанавливаем
              setForm({ ...value, included: value.included.filter((id) => assetsById.has(id)) });
              dismiss();
            }}
            onDiscard={clear}
          />
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Сдаёт смену" htmlFor="from-shift">
            {renderShiftSelect('from-shift', form.fromShiftId, handleFromChange)}
          </Field>
          <Field
            label="Принимает смену"
            htmlFor="to-shift"
            hint={suggestedId && suggestedId === form.toShiftId ? 'Подобрано автоматически по графику' : undefined}
          >
            {renderShiftSelect('to-shift', form.toShiftId, (v) => setForm({ ...form, toShiftId: v ? Number(v) : '' }), suggestedId)}
          </Field>
        </div>

        {/* Кейсы */}
        <section>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900">Что по кейсам?</h3>
              <p className="text-xs text-gray-500">
                {includedAssets.length} {pluralize(includedAssets.length, ['кейс', 'кейса', 'кейсов'])} в передаче — все открытые. Откройте раздел и отметьте только то, что изменилось.
              </p>
            </div>
            {!quickOpen && (
              <Button variant="secondary" size="sm" icon={Plus} onClick={() => setQuickOpen(true)}>
                Новый кейс
              </Button>
            )}
          </div>

          {quickOpen && (
            <div className="mb-3">
              <QuickAssetForm
                onCancel={() => setQuickOpen(false)}
                onCreated={(asset) => {
                  setCreatedAssets((prev) => [asset, ...prev]);
                  include(asset);
                  setQuickOpen(false);
                }}
              />
            </div>
          )}

          {includedAssets.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500">
              Открытых кейсов нет. Новый можно создать кнопкой выше.
            </p>
          ) : (
            <HandoverCaseSections
              assets={includedAssets}
              drafts={form.drafts}
              forceOpen={createdAssets.map((a) => a.asset_type)}
              isTouched={touched}
              previousEntries={previousEntries}
              onChange={updateDraft}
            />
          )}
        </section>

        {/* Общие наблюдения */}
        <section>
          <Field label="Общие наблюдения" htmlFor="handover-notes" hint="Инфраструктура, тревоги, договорённости — всё, что не относится к конкретному кейсу">
            <textarea
              id="handover-notes"
              rows={4}
              className="form-input min-h-[6rem] resize-y leading-relaxed"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Можно оставить пустым, если смена прошла штатно"
            />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_PHRASES.map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() => addPhrase(phrase)}
                className="rounded-full border border-gray-200 bg-surface px-2.5 py-1 text-xs text-gray-600 hover:border-primary-300 hover:text-primary-700"
              >
                + {phrase}
              </button>
            ))}
          </div>
        </section>
      </form>
    </Modal>
  );
};

export default HandoverFormModal;
