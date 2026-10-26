import React from 'react';
import { MessageSquarePlus, Pencil, Trash2 } from 'lucide-react';
import { AssetStatusBadge, CategoryIcon } from '../../../components/assets/AssetBadges';
import { LastEntryLine } from '../../../components/assets/AssetTimeline';
import { CustomFieldsView } from '../../../components/assets/CustomFields';
import IconButton from '../../../components/ui/IconButton';
import { colorClasses } from '../../../constants/palette';
import { useCatalog } from '../../../context/CatalogContext';
import { Asset } from '../../../types';

interface AssetCardProps {
  asset: Asset;
  onOpen: (asset: Asset) => void;
  onEdit: (asset: Asset) => void;
  /** Только для администратора — удаление стирает историю кейса */
  onDelete?: (asset: Asset) => void;
}

const AssetCard: React.FC<AssetCardProps> = ({ asset, onOpen, onEdit, onDelete }) => {
  const { getCategory, isOpenStatus } = useCatalog();
  const category = getCategory(asset.asset_type);
  return (
    <article className={`card flex min-w-0 flex-col border-l-4 ${colorClasses(category.color).accentBorder} p-4 ${isOpenStatus(asset.status) ? '' : 'opacity-75'}`}>
      <div className="flex items-start gap-3">
        <CategoryIcon type={asset.asset_type} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpen(asset)}
            className="block text-left font-semibold text-gray-900 hover:text-primary-700 [overflow-wrap:anywhere]"
          >
            {asset.title}
          </button>
          <p className="text-xs text-gray-500">{category.name}</p>
        </div>
        <div className="-mr-1 -mt-1 flex shrink-0">
          <IconButton icon={MessageSquarePlus} label="Добавить запись" tone="primary" size="sm" onClick={() => onOpen(asset)} />
          <IconButton icon={Pencil} label="Редактировать" tone="primary" size="sm" onClick={() => onEdit(asset)} />
          {onDelete && <IconButton icon={Trash2} label="Удалить" tone="danger" size="sm" onClick={() => onDelete(asset)} />}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <CustomFieldsView category={category} values={asset.custom_fields} compact />
        <button type="button" onClick={() => onOpen(asset)} className="block w-full text-left">
          <p className="line-clamp-2 text-sm text-gray-600 text-wrap-force">{asset.description}</p>
        </button>
      </div>

      <div className="mt-auto space-y-2 pt-3">
        <LastEntryLine entry={asset.last_entry} />
        <AssetStatusBadge status={asset.status} />
      </div>
    </article>
  );
};

export default AssetCard;
