import React from 'react';
import { Shift } from '../../types';
import { ContactButtons, Contacts, hasContacts } from '../users/ContactLinks';
import { formatDayShort, todayKey } from '../../utils/datetime';
import { formatShiftTime } from '../../utils/shifts';
import ShiftStatusBadge from './ShiftStatusBadge';
import ShiftTypeIcon from './ShiftTypeIcon';

interface ShiftRowProps {
  shift: Shift;
  now: Date;
  showDate?: boolean;
  /** Контакты дежурного — вместо статуса показываем кнопки связи */
  contacts?: Contacts;
}

/** Строка смены в списках дашборда. */
const ShiftRow: React.FC<ShiftRowProps> = ({ shift, now, showDate, contacts }) => {
  const isToday = shift.date === todayKey();
  return (
    <li className="flex items-center gap-3 py-3">
      <ShiftTypeIcon shift={shift} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-900">{shift.user_name}</p>
        <p className="truncate text-sm text-gray-500">
          {showDate && <span>{isToday ? 'Сегодня' : formatDayShort(shift.date)}, </span>}
          {formatShiftTime(shift)}
        </p>
      </div>
      {contacts && hasContacts(contacts) ? (
        <ContactButtons contacts={contacts} name={shift.user_name} />
      ) : (
        <ShiftStatusBadge shift={shift} now={now} />
      )}
    </li>
  );
};

export default ShiftRow;
