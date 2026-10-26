import React from 'react';
import clsx from 'clsx';
import { Moon, Sun } from 'lucide-react';
import { Shift } from '../../types';
import { isNightShift, shiftTypeLabel } from '../../utils/shifts';

/** Солнце для дневной смены, луна для ночной. */
const ShiftTypeIcon: React.FC<{ shift: Pick<Shift, 'shift_type'>; className?: string }> = ({ shift, className }) => {
  const night = isNightShift(shift);
  const Icon = night ? Moon : Sun;
  return (
    <span
      title={shiftTypeLabel(shift)}
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-lg',
        night ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600',
        className ?? 'h-9 w-9',
      )}
    >
      <Icon className="h-4 w-4" aria-label={shiftTypeLabel(shift)} />
    </span>
  );
};

export default ShiftTypeIcon;
