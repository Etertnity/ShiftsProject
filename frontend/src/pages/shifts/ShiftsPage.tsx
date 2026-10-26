import React, { useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ChevronLeft, ChevronRight, Moon, Plus, Sun, Users, Wand2 } from 'lucide-react';
import { shiftsApi, usersApi } from '../../api';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import PageHeader from '../../components/ui/PageHeader';
import { PageLoader } from '../../components/ui/Spinner';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useNow } from '../../hooks/useNow';
import { Shift } from '../../types';
import {
  currentMonth,
  dateKeyFromParts,
  daysInMonth,
  MONTH_NAMES,
  MonthRef,
  shiftMonth,
  todayKey,
} from '../../utils/datetime';
import { sortShifts } from '../../utils/shifts';
import MonthAgenda from './components/MonthAgenda';
import MonthCalendar from './components/MonthCalendar';
import ScheduleGeneratorModal from './components/ScheduleGeneratorModal';
import ShiftFormModal, { ShiftFormMode } from './components/ShiftFormModal';
import ShiftStatsPanel from './components/ShiftStatsPanel';

const MONTH_SLIDE = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 24 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -24 }),
};

interface ModalState {
  mode: ShiftFormMode;
  date: string;
  shift?: Shift | null;
}

const ShiftsPage: React.FC = () => {
  const now = useNow();
  const [month, setMonth] = useState<MonthRef>(currentMonth);
  // Направление листания: месяц «уезжает» в сторону, противоположную движению
  const [direction, setDirection] = useState(0);

  const goToMonth = (next: MonthRef) => {
    const delta = next.year * 12 + next.month - (month.year * 12 + month.month);
    if (delta === 0) return;
    setDirection(Math.sign(delta));
    setMonth(next);
  };
  const [userFilter, setUserFilter] = useState(0);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);

  const monthStart = dateKeyFromParts(month.year, month.month, 1);
  const monthEnd = dateKeyFromParts(month.year, month.month, daysInMonth(month));

  const users = useAsyncData(() => usersApi.getAllPublic(), [], 'Не удалось загрузить сотрудников');
  const shifts = useAsyncData(
    () => shiftsApi.getAll({ date_from: monthStart, date_to: monthEnd }),
    [monthStart, monthEnd],
    'Не удалось загрузить смены',
  );
  const monthStats = useAsyncData(() => shiftsApi.stats(monthStart, monthEnd), [monthStart, monthEnd], 'Не удалось загрузить статистику');

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, Shift[]>();
    const visible = (shifts.data ?? []).filter((s) => !userFilter || s.user_id === userFilter);
    for (const shift of sortShifts(visible)) {
      const list = map.get(shift.date) ?? [];
      list.push(shift);
      map.set(shift.date, list);
    }
    return map;
  }, [shifts.data, userFilter]);

  const stats = useMemo(() => {
    const all = Array.from(shiftsByDate.values()).flat();
    return { total: all.length, night: all.filter((s) => s.shift_type === 'night').length };
  }, [shiftsByDate]);

  const today = todayKey();
  const isCurrentMonth = today.startsWith(monthStart.slice(0, 7));
  // Новая смена по умолчанию — на сегодня (если смотрим текущий месяц), иначе на 1-е число
  const defaultDate = isCurrentMonth ? today : monthStart;

  const handleSaved = () => {
    setModal(null);
    setGeneratorOpen(false);
    shifts.reload();
    monthStats.reload();
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="График смен"
        description="Дневные и ночные смены по московскому времени"
        actions={
          <>
            <Button variant="secondary" icon={Wand2} onClick={() => setGeneratorOpen(true)}>
              Автозаполнение
            </Button>
            <Button variant="secondary" icon={Users} onClick={() => setModal({ mode: 'bulk', date: defaultDate })}>
              Несколько смен
            </Button>
            <Button icon={Plus} onClick={() => setModal({ mode: 'create', date: defaultDate })}>
              Добавить смену
            </Button>
          </>
        }
      />

      {/* Панель месяца и фильтр */}
      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-1 sm:justify-start">
          <IconButton icon={ChevronLeft} label="Предыдущий месяц" onClick={() => goToMonth(shiftMonth(month, -1))} />
          <h2 className="min-w-[10rem] text-center text-lg font-semibold text-gray-900">
            {MONTH_NAMES[month.month]} {month.year}
          </h2>
          <IconButton icon={ChevronRight} label="Следующий месяц" onClick={() => goToMonth(shiftMonth(month, 1))} />
          {!isCurrentMonth && (
            <Button variant="ghost" size="sm" onClick={() => goToMonth(currentMonth())} className="ml-1">
              Сегодня
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2 xs:flex-row xs:items-center">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Sun className="h-3.5 w-3.5 text-amber-500" /> {stats.total - stats.night}</span>
            <span className="flex items-center gap-1"><Moon className="h-3.5 w-3.5 text-indigo-500" /> {stats.night}</span>
          </div>
          <select
            aria-label="Фильтр по сотруднику"
            className="form-input py-2 xs:w-56"
            value={userFilter}
            onChange={(e) => setUserFilter(Number(e.target.value))}
          >
            <option value={0}>Все сотрудники</option>
            {(users.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </div>
      </div>

      {shifts.loading || users.loading ? (
        <PageLoader />
      ) : (
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <m.div
            key={`${month.year}-${month.month}`}
            custom={direction}
            variants={MONTH_SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={shifts.refreshing ? 'opacity-60 transition-opacity' : 'transition-opacity'}
          >
            <div className="hidden md:block">
              <MonthCalendar
                month={month}
                shiftsByDate={shiftsByDate}
                now={now}
                onAdd={(date) => setModal({ mode: 'create', date })}
                onOpen={(shift) => setModal({ mode: 'edit', date: shift.date, shift })}
              />
            </div>
            <div className="md:hidden">
              <MonthAgenda
                month={month}
                shiftsByDate={shiftsByDate}
                now={now}
                onAdd={(date) => setModal({ mode: 'create', date })}
                onOpen={(shift) => setModal({ mode: 'edit', date: shift.date, shift })}
              />
            </div>
          </m.div>
        </AnimatePresence>
      )}

      {/* Легенда цветов графика */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs text-gray-500">
        {[
          ['border-l-amber-500 bg-amber-50', 'Дневная'],
          ['border-l-indigo-500 bg-indigo-50', 'Ночная'],
          ['border-l-emerald-500 bg-emerald-50', 'Отработана'],
          ['border-l-orange-500 bg-orange-50', 'Разделена между сотрудниками'],
        ].map(([cls, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`h-3 w-4 rounded-sm border-l-[3px] ${cls}`} aria-hidden />
            {label}
          </span>
        ))}
      </div>

      <ShiftStatsPanel title={`Отработано за ${MONTH_NAMES[month.month].toLowerCase()}`} items={monthStats.data?.items ?? []} />

      <ShiftFormModal
        open={!!modal}
        mode={modal?.mode ?? 'create'}
        date={modal?.date ?? today}
        shift={modal?.shift}
        users={users.data ?? []}
        shifts={shifts.data ?? []}
        onClose={() => setModal(null)}
        onSaved={handleSaved}
      />
      <ScheduleGeneratorModal
        open={generatorOpen}
        users={users.data ?? []}
        defaultFrom={isCurrentMonth ? today : monthStart}
        defaultTo={monthEnd}
        onClose={() => setGeneratorOpen(false)}
        onApplied={handleSaved}
      />
    </div>
  );
};

export default ShiftsPage;
