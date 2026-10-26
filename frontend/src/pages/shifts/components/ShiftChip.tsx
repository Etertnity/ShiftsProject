import React from 'react';
import clsx from 'clsx';
import { CheckCircle2, Moon, Split, Sun } from 'lucide-react';
import { Shift } from '../../../types';
import { formatParts, formatShiftTime, getShiftStatus, getShiftVisual, isNightShift, SHIFT_STATUS_LABELS, shiftTypeLabel } from '../../../utils/shifts';
import { shortName } from '../../../utils/strings';

interface ShiftChipProps {
  shift: Shift;
  now: Date;
  onClick: (shift: Shift) => void;
}

/**
 * Плашка смены в ячейке календаря.
 * Предстоящие — цвет дня/ночи, отработанные целиком — зелёные, разделённые — оранжевые.
 */
const ShiftChip: React.FC<ShiftChipProps> = ({ shift, now, onClick }) => {
  const night = isNightShift(shift);
  const visual = getShiftVisual(shift, now);
  const Icon = visual === 'done' ? CheckCircle2 : visual === 'done-partial' ? Split : night ? Moon : Sun;
  const partial = shift.segments.length > 0;
  const label = partial ? shift.segments.map((s) => s.user_name.split(' ')[0]).join(' / ') : shortName(shift.user_name);

  const tooltip = [
    `${shiftTypeLabel(shift)} ${formatShiftTime(shift)} — ${SHIFT_STATUS_LABELS[getShiftStatus(shift, now)].toLowerCase()}`,
    partial ? formatParts(shift) : shift.user_name,
    shift.notes,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <button
      type="button"
      onClick={() => onClick(shift)}
      title={tooltip}
      className={clsx(
        'flex w-full min-w-0 items-center gap-1.5 rounded-md border-l-[3px] px-1 py-1 text-left text-xs transition-colors xl:px-1.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
        visual === 'done' && 'border-l-emerald-500 bg-emerald-50 text-emerald-900 hover:bg-emerald-100',
        visual === 'done-partial' && 'border-l-orange-500 bg-orange-50 text-orange-900 hover:bg-orange-100',
        (visual === 'upcoming' || visual === 'active') &&
          (night ? 'border-l-indigo-500 bg-indigo-50 text-indigo-900 hover:bg-indigo-100' : 'border-l-amber-500 bg-amber-50 text-amber-900 hover:bg-amber-100'),
        visual === 'active' && 'ring-2 ring-primary-500/70',
      )}
    >
      <Icon className="hidden h-3 w-3 shrink-0 xl:block" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {visual === 'active' && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary-500" aria-label="Идёт сейчас" />}
      <span className="hidden shrink-0 tabular-nums opacity-70 2xl:inline">{shift.start_time}</span>
    </button>
  );
};

export default ShiftChip;
