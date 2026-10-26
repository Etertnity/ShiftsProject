import React from 'react';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { Shift } from '../../../types';
import { MonthRef, monthGrid, todayKey, WEEKDAY_SHORT } from '../../../utils/datetime';
import ShiftChip from './ShiftChip';

interface MonthCalendarProps {
  month: MonthRef;
  shiftsByDate: Map<string, Shift[]>;
  now: Date;
  onAdd: (date: string) => void;
  onOpen: (shift: Shift) => void;
}

/** Сетка месяца для планшетов и компьютеров. Ячейки растут по содержимому — без внутренних скроллов. */
const MonthCalendar: React.FC<MonthCalendarProps> = ({ month, shiftsByDate, now, onAdd, onOpen }) => {
  const today = todayKey();
  const cells = monthGrid(month);

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {WEEKDAY_SHORT.map((day, i) => (
          <div key={day} className={clsx('py-2 text-center text-xs font-semibold uppercase tracking-wide', i >= 5 ? 'text-red-400' : 'text-gray-500')}>
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((dateKey, index) => {
          const isLastCol = index % 7 === 6;
          const isLastRow = index >= cells.length - 7;
          const cellBorder = clsx(!isLastCol && 'border-r', !isLastRow && 'border-b', 'border-gray-100');

          if (!dateKey) return <div key={`empty-${index}`} className={clsx('min-h-[7rem] bg-gray-50/60', cellBorder)} />;

          const dayShifts = shiftsByDate.get(dateKey) ?? [];
          const isToday = dateKey === today;
          const isWeekend = index % 7 >= 5;

          return (
            <div key={dateKey} className={clsx('group flex min-h-[7rem] min-w-0 flex-col gap-1 p-1 xl:p-1.5', cellBorder, isToday && 'bg-primary-50/50')}>
              <div className="flex items-center justify-between">
                <span
                  className={clsx(
                    'flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-xs font-semibold',
                    isToday ? 'bg-primary-600 text-white' : isWeekend ? 'text-red-400' : 'text-gray-700',
                  )}
                >
                  {Number(dateKey.slice(8))}
                </span>
                <button
                  type="button"
                  onClick={() => onAdd(dateKey)}
                  // На устройствах с мышью «+» появляется при наведении, на планшетах виден всегда
                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition hover:bg-primary-50 hover:text-primary-600 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
                  aria-label={`Добавить смену на ${dateKey}`}
                  title="Добавить смену"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                {dayShifts.map((shift) => (
                  <ShiftChip key={shift.id} shift={shift} now={now} onClick={onOpen} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthCalendar;
