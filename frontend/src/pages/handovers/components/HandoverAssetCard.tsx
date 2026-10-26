import React, { memo } from 'react';
import clsx from 'clsx';
import { m } from 'motion/react';
import { CheckCircle2, Sparkles, X } from 'lucide-react';
import { AssetStatusBadge, CategoryIcon } from '../../../components/assets/AssetBadges';
import { LastEntryLine } from '../../../components/assets/AssetTimeline';
import { CustomFieldsView } from '../../../components/assets/CustomFields';
import StatusChips from '../../../components/assets/StatusChips';
import IconButton from '../../../components/ui/IconButton';
import { useCatalog } from '../../../context/CatalogContext';
import { Asset, AssetEntry } from '../../../types';

export interface AssetDraft {
  status: string;
  text: string;
}

interface HandoverAssetCardProps {
  asset: Asset;
  draft: AssetDraft;
  /** Актив уже обновляли в текущую смену (записи в истории после начала смены) */
  touchedThisShift: boolean;
  /** При редактировании передачи — что по активу уже записали в ней */
  previousEntries: AssetEntry[];
  /** Стабильная функция (useCallback): карточка мемоизирована и перерисовывается, только когда меняется она сама */
  onChange: (assetId: number, draft: AssetDraft) => void;
  /** Убрать из передачи — только при правке старой передачи; новая включает все открытые кейсы */
  onRemove?: () => void;
}

/**
 * Карточка кейса в передаче смены: последняя запись истории, статус одним нажатием
 * и короткая заметка «что сделано». Описание не переписывается — заметка уходит в историю.
 */
const HandoverAssetCard: React.FC<HandoverAssetCardProps> = ({ asset, draft, touchedThisShift, previousEntries, onChange, onRemove }) => {
  const { getCategory, getStatus, isOpenStatus } = useCatalog();
  const changed = draft.status !== asset.status || !!draft.text.trim();
  // Закрывается в этой передаче — или уже закрыт за смену (тогда кейс попадает сюда последний раз)
  const closingNow = isOpenStatus(asset.status) && !isOpenStatus(draft.status);
  const closedEarlier = !isOpenStatus(asset.status);

  return (
    <m.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx('rounded-xl border bg-surface p-3 transition-colors', changed ? 'border-primary-300 ring-1 ring-primary-200' : 'border-gray-200')}
    >
      <div className="flex items-start gap-3">
        <CategoryIcon type={asset.asset_type} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 truncate font-semibold text-gray-900" title={asset.title}>{asset.title}</p>
            <AssetStatusBadge status={asset.status} />
            {touchedThisShift && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-600">
                <Sparkles className="h-3 w-3" /> обновлялся в эту смену
              </span>
            )}
          </div>
          <div className="mt-1 space-y-1">
            <CustomFieldsView category={getCategory(asset.asset_type)} values={asset.custom_fields} compact />
            {asset.last_entry ? <LastEntryLine entry={asset.last_entry} /> : <p className="line-clamp-1 text-xs text-gray-500">{asset.description}</p>}
          </div>
        </div>
        {onRemove && <IconButton icon={X} label="Убрать из передачи" size="sm" onClick={onRemove} className="-mr-1 -mt-1" />}
      </div>

      {previousEntries.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          {previousEntries.map((entry) => (
            <li key={entry.id} className="[overflow-wrap:anywhere]">
              <span className="text-gray-400">уже в передаче: </span>
              {entry.new_status && <span className="font-medium">→ {getStatus(entry.new_status).name}. </span>}
              {entry.text}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 space-y-2">
        <StatusChips value={draft.status} current={asset.status} onChange={(status) => onChange(asset.id, { ...draft, status })} size="sm" />
        <textarea
          aria-label={`Что сделано: ${asset.title}`}
          rows={1}
          className="form-input min-h-[2.75rem] resize-y py-2"
          placeholder="Что сделано? (необязательно)"
          value={draft.text}
          onChange={(e) => onChange(asset.id, { ...draft, text: e.target.value })}
        />
        {(closingNow || closedEarlier) && (
          <p className="flex items-start gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {closingNow
              ? 'Кейс закроется: запишется в эту передачу и в следующую уже не перейдёт'
              : 'Закрыт в эту смену — попадает в передачу последний раз'}
          </p>
        )}
      </div>
    </m.li>
  );
};

export default memo(HandoverAssetCard);
