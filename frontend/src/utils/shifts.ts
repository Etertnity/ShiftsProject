import { Shift, ShiftCoverage, ShiftStatus, ShiftType } from '../types';
import { addDays, APP_UTC_OFFSET, formatDayShort, mskDateTime } from './datetime';

const DAY_MS = 24 * 60 * 60 * 1000;

export const SHIFT_PRESETS: Record<ShiftType, { start: string; end: string; label: string }> = {
  day: { start: '09:00', end: '21:00', label: 'Дневная' },
  night: { start: '21:00', end: '09:00', label: 'Ночная' },
};

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  upcoming: 'Ожидается',
  active: 'Идёт сейчас',
  finished: 'Завершена',
};

export const isNightShift = (shift: Pick<Shift, 'shift_type'>) => shift.shift_type === 'night';

export const shiftTypeLabel = (shift: Pick<Shift, 'shift_type'>) =>
  isNightShift(shift) ? SHIFT_PRESETS.night.label : SHIFT_PRESETS.day.label;

/** Начало и конец смены. Если конец не позже начала — смена заканчивается на следующий день. */
export const shiftInterval = (shift: Pick<Shift, 'date' | 'start_time' | 'end_time'>) => {
  const start = mskDateTime(shift.date, shift.start_time);
  let end = mskDateTime(shift.date, shift.end_time);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + DAY_MS);
  return { start, end };
};

export const getShiftStatus = (shift: Shift, now: Date = new Date()): ShiftStatus => {
  const { start, end } = shiftInterval(shift);
  if (now < start) return 'upcoming';
  if (now < end) return 'active';
  return 'finished';
};

export const compareShifts = (a: Shift, b: Shift) =>
  shiftInterval(a).start.getTime() - shiftInterval(b).start.getTime() || a.user_name.localeCompare(b.user_name);

export const sortShifts = (shifts: Shift[]) => [...shifts].sort(compareShifts);

export const shiftsOnDate = (shifts: Shift[], dateKey: string) => sortShifts(shifts.filter((s) => s.date === dateKey));

/** Смены, которые идут прямо сейчас. */
export const findActiveShifts = (shifts: Shift[], now: Date = new Date()) =>
  sortShifts(shifts.filter((s) => getShiftStatus(s, now) === 'active'));

/** Ближайшие ещё не начавшиеся смены. */
export const findUpcomingShifts = (shifts: Shift[], limit = 5, now: Date = new Date()) =>
  sortShifts(shifts.filter((s) => getShiftStatus(s, now) === 'upcoming')).slice(0, limit);

/**
 * Следующая смена по графику: после дневной — ночная того же дня, после ночной — дневная следующего.
 * Если по типу ничего не нашлось — ближайшая смена, начинающаяся после окончания текущей.
 */
export const findNextShift = (from: Shift, shifts: Shift[]): Shift | null => {
  const targetDate = isNightShift(from) ? addDays(from.date, 1) : from.date;
  const targetType: ShiftType = isNightShift(from) ? 'day' : 'night';
  const byType = shiftsOnDate(shifts, targetDate).find((s) => s.shift_type === targetType && s.id !== from.id);
  if (byType) return byType;

  const fromEnd = shiftInterval(from).end.getTime();
  return (
    sortShifts(shifts).find((s) => s.id !== from.id && shiftInterval(s).start.getTime() >= fromEnd) ?? null
  );
};

export const formatShiftTime = (shift: Pick<Shift, 'start_time' | 'end_time'>) =>
  `${shift.start_time}–${shift.end_time}`;

export const formatShiftLabel = (shift: Shift) =>
  `${shift.user_name} · ${formatDayShort(shift.date)}, ${formatShiftTime(shift)}`;

export interface ShiftPart {
  user_id: number;
  user_name: string;
  start: Date;
  end: Date;
}

/** Местное время части смены ("2026-10-19T15:00") как момент по Москве. */
export const parseLocalDateTime = (value: string): Date => new Date(`${value}:00${APP_UTC_OFFSET}`);

/** Кто и когда работал в смене: части, а если их нет — вся смена за назначенным сотрудником. */
export const shiftParts = (shift: Shift): ShiftPart[] => {
  if (shift.segments?.length) {
    return shift.segments.map((s) => ({ user_id: s.user_id, user_name: s.user_name, start: parseLocalDateTime(s.start_at), end: parseLocalDateTime(s.end_at) }));
  }
  const { start, end } = shiftInterval(shift);
  return [{ user_id: shift.user_id, user_name: shift.user_name, start, end }];
};

/** Смену отработали несколько человек — подсвечиваем оранжевым. */
export const getShiftCoverage = (shift: Shift): ShiftCoverage =>
  new Set(shiftParts(shift).map((p) => p.user_id)).size > 1 ? 'partial' : 'full';

/** Кто на смене прямо сейчас (с учётом передачи части смены). */
export const currentWorker = (shift: Shift, now: Date = new Date()): ShiftPart =>
  shiftParts(shift).find((p) => now >= p.start && now < p.end) ?? shiftParts(shift)[0];

const timeOf = (date: Date) =>
  date.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });

export const formatPartTime = (part: ShiftPart) => `${timeOf(part.start)}–${timeOf(part.end)}`;

/** «Тимофей 09:00–15:00 · Коля 15:00–21:00» */
export const formatParts = (shift: Shift) => shiftParts(shift).map((p) => `${p.user_name} ${formatPartTime(p)}`).join(' · ');

/**
 * Как подсвечивать смену в графике:
 * завершённая целиком одним сотрудником — зелёная, разделённая между несколькими — оранжевая.
 */
export type ShiftVisual = 'upcoming' | 'active' | 'done' | 'done-partial';

export const getShiftVisual = (shift: Shift, now: Date = new Date()): ShiftVisual => {
  const status = getShiftStatus(shift, now);
  if (status !== 'finished') return status;
  return getShiftCoverage(shift) === 'partial' ? 'done-partial' : 'done';
};
