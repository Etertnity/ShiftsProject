import React, { useEffect, useState } from 'react';
import { History, Pencil, Trash2 } from 'lucide-react';
import { assetsApi } from '../../api';
import { useCatalog } from '../../context/CatalogContext';
import { Asset, AssetEntry } from '../../types';
import { formatDateTime } from '../../utils/datetime';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import { AssetStatusBadge, AssetTypeBadge } from './AssetBadges';
import AssetTimeline from './AssetTimeline';
import { CustomFieldsView } from './CustomFields';
import EntryComposer from './EntryComposer';

interface AssetDetailModalProps {
  asset: Asset | null;
  onClose: () => void;
  onEdit?: (asset: Asset) => void;
  onDelete?: (asset: Asset) => void;
  /** Актив изменился (новая запись, статус) — родитель может обновить список */
  onChanged?: () => void;
}

/** Карточка актива: поля, описание и история с быстрой записью. */
const AssetDetailModal: React.FC<AssetDetailModalProps> = ({ asset, onClose, onEdit, onDelete, onChanged }) => {
  const { getCategory } = useCatalog();
  const [current, setCurrent] = useState<Asset | null>(asset);
  const [entries, setEntries] = useState<AssetEntry[] | null>(null);

  useEffect(() => {
    setCurrent(asset);
    setEntries(null);
    if (!asset) return;
    let cancelled = false;
    assetsApi
      .getEntries(asset.id)
      .then((data) => !cancelled && setEntries(data))
      .catch(() => !cancelled && setEntries([]));
    return () => {
      cancelled = true;
    };
  }, [asset]);

  const handleAdded = (entry: AssetEntry) => {
    setEntries((prev) => [entry, ...(prev ?? [])]);
    if (entry.new_status && current) setCurrent({ ...current, status: entry.new_status });
    onChanged?.();
  };

  return (
    <Modal
      open={!!asset}
      onClose={onClose}
      title={current?.title ?? ''}
      size="lg"
      footer={
        current && (
          <>
            {onDelete && (
              <Button variant="ghost" icon={Trash2} onClick={() => onDelete(current)} className="text-red-600 hover:bg-red-50 hover:text-red-700 sm:mr-auto">
                Удалить
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>Закрыть</Button>
            {onEdit && <Button icon={Pencil} onClick={() => onEdit(current)}>Редактировать</Button>}
          </>
        )
      }
    >
      {current && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <AssetTypeBadge type={current.asset_type} />
            <AssetStatusBadge status={current.status} />
          </div>

          <CustomFieldsView category={getCategory(current.asset_type)} values={current.custom_fields} />

          <p className="text-sm leading-relaxed text-gray-700 text-wrap-force">{current.description}</p>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <History className="h-4 w-4 text-gray-400" /> История
            </h3>
            <EntryComposer asset={current} onAdded={handleAdded} />
            <div className="mt-5">
              {entries ? <AssetTimeline entries={entries} /> : <div className="flex justify-center py-4"><Spinner /></div>}
            </div>
          </section>

          <p className="border-t border-gray-100 pt-3 text-xs text-gray-400">
            Создан {formatDateTime(current.created_at)} · обновлён {formatDateTime(current.updated_at)}
          </p>
        </div>
      )}
    </Modal>
  );
};

export default AssetDetailModal;
