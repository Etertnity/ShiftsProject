import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, ChevronUp, Plus } from 'lucide-react';
import ShiftStatusBadge from '../../../components/shifts/ShiftStatusBadge';
import ShiftTypeIcon from '../../../components/shifts/ShiftTypeIcon';
import { Shift } from '../../../types';
import { formatDayShort, MonthRef, monthDays, todayKey, weekdayIndex } from '../../../utils/datetime';
import { formatPartTime, formatShiftTime, shiftParts } from '../../../utils/shifts';

interface MonthAgendaProps {
  month: MonthRef;
  shiftsByDate: Map<string, Shift[]>;
  now: Date;
  onAdd: (date: string) => void;
  onOpen: (shift: Shift) => void;
}

/**
 * Список по дням для телефонов: читается на любой ширине.
 * В текущем месяце прошедшие дни свёрнуты, чтобы сегодняшний день был первым в списке.
 */
const MonthAgenda: React.FC<MonthAgendaProps> = ({ month, shiftsByDate, now, onAdd, onOpen }) => {
  const today = todayKey();
  const [showPast, setShowPast] = useState(false);
  const days = monthDays(month);

  useEffect(() => setShowPast(false), [month.year, month.month]);

  const pastCount = days.filter((d) => d < today).length;
  const isCurrentMonth = pastCount > 0 && pastCount < days.length;
  const visibleDays = isCurrentMonth && !showPast ? days.filter((d) => d >= today) : days;

  return (
    <ul className="space-y-2">
      {isCurrentMonth && (
        <li>
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 py-2.5 text-sm font-medium text-gray-500 hover:bg-surface hover:text-gray-900"
          >
            {showPast ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showPast ? 'Скрыть прошедшие дни' : `Показать прошедшие дни (${pastCount})`}
          </button>
        </li>
      )}
      {visibleDays.map((dateKey) => {
        const dayShifts = shiftsByDate.get(dateKey) ?? [];
        const isToday = dateKey === today;
        const isWeekend = weekdayIndex(dateKey) >= 5;

        return (
          <li
            key={dateKey}

            className={clsx('card overflow-hidden', isToday && 'ring-2 ring-primary-500/60')}
          >
            <div className={clsx('flex items-center justify-between gap-2 px-3 py-2', dayShifts.length > 0 && 'border-b border-gray-100')}>
              <div className="flex min-w-0 items-center gap-2">
                <span className={clsx('inline-block text-sm font-semibold first-letter:uppercase', isWeekend ? 'text-red-500' : 'text-gray-900')}>
                  {formatDayShort(dateKey)}
                </span>
                {isToday && <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[11px] font-semibold text-white">Сегодня</span>}
                {dayShifts.length === 0 && <span className="truncate text-xs text-gray-400">нет смен</span>}
              </div>
              <button
                type="button"
                onClick={() => onAdd(dateKey)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-primary-50 hover:text-primary-600"
                aria-label={`Добавить смену на ${formatDayShort(dateKey)}`}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {dayShifts.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {dayShifts.map((shift) => (
                  <li key={shift.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(shift)}
                      className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50"
                    >
                      <ShiftTypeIcon shift={shift} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {shift.segments.length ? shift.segments.map((s) => s.user_name).join(' → ') : shift.user_name}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {shift.segments.length ? shiftParts(shift).map(formatPartTime).join(' · ') : formatShiftTime(shift)}
                        </p>
                      </div>
                      <span className="hidden xs:inline-flex">
                        <ShiftStatusBadge shift={shift} now={now} />
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default MonthAgenda;
