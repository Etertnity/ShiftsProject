import React from 'react';
import { RotateCcw, X } from 'lucide-react';
import { formatRelative } from '../../utils/datetime';

interface DraftBannerProps {
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
}

/** Плашка «найден несохранённый черновик» — текст не теряется при случайном закрытии окна. */
const DraftBanner: React.FC<DraftBannerProps> = ({ savedAt, onRestore, onDiscard }) => (
  <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 xs:flex-row xs:items-center xs:justify-between">
    <span>Есть несохранённый черновик ({formatRelative(new Date(savedAt).toISOString())})</span>
    <span className="flex shrink-0 gap-1">
      <button type="button" onClick={onRestore} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-amber-100">
        <RotateCcw className="h-3.5 w-3.5" /> Восстановить
      </button>
      <button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-amber-700 hover:bg-amber-100">
        <X className="h-3.5 w-3.5" /> Удалить
      </button>
    </span>
  </div>
);

export default DraftBanner;
