import React from 'react';
import { Shift } from '../../types';
import { getShiftVisual, ShiftVisual } from '../../utils/shifts';
import Badge from '../ui/Badge';

const STYLES: Record<ShiftVisual, { badge: string; dot: string; label: string }> = {
  active: { badge: 'bg-primary-50 text-primary-700 ring-primary-200', dot: 'bg-primary-500 animate-pulse', label: 'Идёт сейчас' },
  upcoming: { badge: 'bg-gray-100 text-gray-600 ring-gray-200', dot: 'bg-gray-400', label: 'Ожидается' },
  done: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', label: 'Отработана' },
  'done-partial': { badge: 'bg-orange-50 text-orange-700 ring-orange-200', dot: 'bg-orange-500', label: 'Отработана частично' },
};

/** Статус смены: зелёный — отработана целиком, оранжевый — разделена между сотрудниками. */
const ShiftStatusBadge: React.FC<{ shift: Shift; now: Date }> = ({ shift, now }) => {
  const style = STYLES[getShiftVisual(shift, now)];
  return (
    <Badge className={style.badge} dot={style.dot}>
      {style.label}
    </Badge>
  );
};

export default ShiftStatusBadge;
