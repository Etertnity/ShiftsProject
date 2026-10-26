/**
 * Все смены ведутся по московскому времени (UTC+3, без перехода на летнее время),
 * поэтому расчёты не зависят от часового пояса устройства сотрудника.
 */
export const APP_TIME_ZONE = 'Europe/Moscow';
export const APP_UTC_OFFSET = '+03:00';

const DAY_MS = 24 * 60 * 60 * 1000;

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Дата в формате YYYY-MM-DD по Москве. */
export const toDateKey = (date: Date): string => dateKeyFormatter.format(date);

export const todayKey = (): string => toDateKey(new Date());

export const dateKeyFromParts = (year: number, monthIndex: number, day: number): string =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** Разбирает YYYY-MM-DD как полночь UTC — удобно для арифметики дат без влияния часового пояса. */
const keyToUtc = (dateKey: string): Date => new Date(`${dateKey}T00:00:00Z`);

export const addDays = (dateKey: string, days: number): string =>
  new Date(keyToUtc(dateKey).getTime() + days * DAY_MS).toISOString().slice(0, 10);

/** Момент времени для даты и времени смены по Москве. */
export const mskDateTime = (dateKey: string, time: string): Date =>
  new Date(`${dateKey}T${time.padStart(5, '0')}:00${APP_UTC_OFFSET}`);

/** Бэкенд старых версий отдавал даты без "Z" — считаем их UTC. */
export const parseServerDate = (value: string): Date =>
  new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);

export const formatDateTime = (value: string): string =>
  parseServerDate(value).toLocaleString('ru-RU', {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const formatDate = (value: string): string =>
  parseServerDate(value).toLocaleDateString('ru-RU', { timeZone: APP_TIME_ZONE });

/** «только что», «15 мин назад», «3 ч назад», «вчера, 21:05», иначе дата и время. */
export const formatRelative = (value: string, now: Date = new Date()): string => {
  const date = parseServerDate(value);
  const diffMin = Math.round((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffMin < 6 * 60) return `${Math.floor(diffMin / 60)} ч назад`;
  const time = date.toLocaleTimeString('ru-RU', { timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit' });
  const day = toDateKey(date);
  if (day === toDateKey(now)) return `сегодня, ${time}`;
  if (day === addDays(toDateKey(now), -1)) return `вчера, ${time}`;
  return formatDateTime(value);
};

/** "пн, 19 окт." для ключа даты. */
export const formatDayShort = (dateKey: string): string =>
  keyToUtc(dateKey).toLocaleDateString('ru-RU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

/** "понедельник, 19 октября" для ключа даты. */
export const formatDayLong = (dateKey: string): string =>
  keyToUtc(dateKey).toLocaleDateString('ru-RU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

/** 0 — понедельник … 6 — воскресенье. */
export const weekdayIndex = (dateKey: string): number => (keyToUtc(dateKey).getUTCDay() + 6) % 7;

export const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export interface MonthRef {
  year: number;
  month: number; // 0-11
}

export const currentMonth = (): MonthRef => {
  const [year, month] = todayKey().split('-').map(Number);
  return { year, month: month - 1 };
};

export const shiftMonth = ({ year, month }: MonthRef, delta: number): MonthRef => {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
};

export const daysInMonth = ({ year, month }: MonthRef): number => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** Все дни месяца в виде ключей YYYY-MM-DD. */
export const monthDays = (ref: MonthRef): string[] =>
  Array.from({ length: daysInMonth(ref) }, (_, i) => dateKeyFromParts(ref.year, ref.month, i + 1));

/** Сетка календаря с понедельника: null — пустая ячейка. Количество недель — ровно сколько нужно. */
export const monthGrid = (ref: MonthRef): (string | null)[] => {
  const days = monthDays(ref);
  const leading = weekdayIndex(days[0]);
  const cells: (string | null)[] = [...Array(leading).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};
