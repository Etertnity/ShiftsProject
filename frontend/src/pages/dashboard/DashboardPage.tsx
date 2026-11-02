import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { m } from 'motion/react';
import { AlertCircle, ArrowRight, ArrowRightLeft, CalendarDays, Clock, Package, Timer } from 'lucide-react';
import { assetsApi, handoversApi, shiftsApi, usersApi } from '../../api';
import ShiftRow from '../../components/shifts/ShiftRow';
import ShiftTypeIcon from '../../components/shifts/ShiftTypeIcon';
import { ContactButtons } from '../../components/users/ContactLinks';
import OceanScene from '../../components/visual/OceanScene';
import { AssetStatusBadge, CategoryIcon } from '../../components/assets/AssetBadges';
import { LastEntryLine } from '../../components/assets/AssetTimeline';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/Spinner';
import WaveBadge from '../../components/ui/WaveBadge';
import { useCurrentUser } from '../../context/AuthContext';
import { useCatalog } from '../../context/CatalogContext';
import { useTheme } from '../../context/ThemeContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useNow } from '../../hooks/useNow';
import { Handover } from '../../types';
import { addDays, formatDateTime, formatDayLong, mskDateTime, todayKey } from '../../utils/datetime';
import { currentWorker, findActiveShifts, findUpcomingShifts, formatPartTime, shiftInterval, sortShifts } from '../../utils/shifts';
import StatStrip from './components/StatCard';

const greeting = (now: Date) => {
  const hour = Number(now.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }));
  if (hour < 5) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
};

const SectionCard: React.FC<{ title: string; icon: React.ElementType; link?: string; children: React.ReactNode }> = ({
  title,
  icon: Icon,
  link,
  children,
}) => (
  <section className="card flex min-w-0 flex-col p-4 sm:p-5">
    <div className="mb-1 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.12em] text-gray-900">
        <Icon className="h-4 w-4 text-accent-500" aria-hidden />
        {title}
      </h2>
      {link && (
        <Link to={link} className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700">
          Все <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
    {children}
  </section>
);

const DashboardPage: React.FC = () => {
  const user = useCurrentUser();
  const { isOpenStatus } = useCatalog();
  // Сцена следует времени суток, а не теме: днём закат над портом, ночью луна
  const { isNightTime } = useTheme();
  const now = useNow();
  const today = todayKey();

  const { data, loading } = useAsyncData(
    async () => {
      // Берём окно ±1 день: этого достаточно для «сегодня», «сейчас» и «ближайших» смен
      const monthStart = `${today.slice(0, 8)}01`;
      const [handovers, lastFirst, lastSecond, shifts, assets, monthStats, team] = await Promise.all([
        // Для дашборда нужна только последняя передача и общее число — весь журнал не грузим
        handoversApi.list(1, 0),
        // И последняя передача каждой волны: сменные видят, что передала 2 волна, и наоборот
        handoversApi.list(1, 0, 1),
        handoversApi.list(1, 0, 2),
        shiftsApi.getAll({ date_from: addDays(today, -1), date_to: addDays(today, 2) }),
        assetsApi.getAll(),
        shiftsApi.stats(monthStart, today),
        // Контакты для кнопок связи — только те, что коллеги разрешили показывать
        usersApi.getAllPublic().catch(() => []),
      ]);
      // Мои отработанные часы за текущий месяц
      const myHours = Math.round(monthStats.items.find((i) => i.user_id === user.id)?.worked_hours ?? 0);
      const contacts = new Map(team.map((u) => [u.id, u]));
      const lastByWave = [lastFirst.items[0], lastSecond.items[0]].filter((h): h is Handover => !!h);
      return { handovers, lastByWave, shifts, assets, myHours, contacts };
    },
    [today, user.id],
    'Не удалось загрузить дашборд',
  );

  const view = useMemo(() => {
    if (!data) return null;
    const dayStart = mskDateTime(today, '00:00');
    const dayEnd = mskDateTime(addDays(today, 1), '00:00');
    const todayShifts = sortShifts(
      data.shifts.filter((s) => {
        const { start, end } = shiftInterval(s);
        return start < dayEnd && end > dayStart;
      }),
    );
    return {
      // «Открытые» — все статусы, которые администратор не пометил как закрытые
      openAssets: data.assets.filter((a) => isOpenStatus(a.status)),
      todayShifts,
      activeShifts: findActiveShifts(data.shifts, now),
      upcomingShifts: findUpcomingShifts(data.shifts, 5, now),
      lastHandover: data.handovers.items[0],
    };
  }, [data, today, now, isOpenStatus]);

  if (loading || !data || !view) return <PageLoader />;

  const firstName = user.name.split(' ')[0];

  // Строка под приветствием — про самого сотрудника: на смене ли он и когда следующая
  const myActive = view.activeShifts.find((shift) => currentWorker(shift, now).user_id === user.id);
  const myNext = findUpcomingShifts(data.shifts, 20, now).find((shift) => shift.user_id === user.id);
  const when = (date: string, time: string) =>
    date === today ? `сегодня, ${time}` : date === addDays(today, 1) ? `завтра, ${time}` : `${formatDayLong(date)}, ${time}`;
  const myStatus = myActive
    ? `Вы на смене до ${formatPartTime(currentWorker(myActive, now)).split('–')[1]}`
    : myNext
      ? `Следующая смена: ${when(myNext.date, myNext.start_time)}`
      : 'В ближайшие дни смен у вас нет';

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Баннер: море, спутник и порт (днём — закат, ночью — луна), приветствие и кто сейчас на смене.
          Класс dark — содержимое всегда в «ночных» цветах поверх тёмной сцены */}
      <section className="dark relative isolate flex min-h-[460px] flex-col overflow-hidden rounded-3xl text-white shadow-pop sm:min-h-[480px]">
        <OceanScene night={isNightTime} className="-z-20" />
        {/* Затемнение слева — текст читается на любом кадре сцены */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-950/75 via-navy-950/30 to-transparent" />

        <div className="flex flex-1 flex-col p-5 sm:p-8 lg:p-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">{formatDayLong(today)}</p>
          <h1 className="mt-3 max-w-2xl font-display text-[2.1rem] font-bold uppercase leading-[0.98] tracking-wide [text-shadow:0_2px_16px_rgb(0_0_0/0.35)] sm:text-5xl lg:text-6xl">
            {greeting(now)}, {firstName}
          </h1>
          <p className="mt-2 font-display text-lg font-medium tracking-wide text-accent-400 [text-shadow:0_1px_8px_rgb(0_0_0/0.35)] sm:text-2xl">
            {myStatus}
          </p>
          <p className="mt-3 max-w-md text-sm text-white/80 sm:text-base">
            {view.lastHandover ? `Последняя передача — ${formatDateTime(view.lastHandover.created_at)}` : 'Передач пока не было'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              to="/handovers"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-accent-400 px-5 text-sm font-semibold text-navy-900 shadow-beacon transition-colors hover:bg-accent-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
            >
              Передать смену <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/shifts"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-navy-950/40 px-4 text-sm font-semibold text-white ring-1 ring-inset ring-white/40 backdrop-blur-sm transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <CalendarDays className="h-4 w-4" /> График смен
            </Link>
          </div>

          {/* Кто сейчас на смене — стеклянная панель поверх моря */}
          <div className="mt-auto pt-8 lg:max-w-2xl">
            <div className="rounded-2xl bg-navy-950/50 p-3 ring-1 ring-inset ring-white/15 backdrop-blur-md sm:p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
                </span>
                Сейчас на смене
              </p>
              {view.activeShifts.length > 0 ? (
                <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  {view.activeShifts.map((shift, index) => {
                    // Если смену разделили — показываем того, кто на ней прямо сейчас
                    const worker = currentWorker(shift, now);
                    return (
                      <m.li
                        key={shift.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.08 * index, duration: 0.3 }}
                        className="flex min-w-0 items-center gap-3 rounded-xl bg-white/10 p-2.5 ring-1 ring-inset ring-white/10"
                      >
                        <ShiftTypeIcon shift={shift} className="h-9 w-9 !bg-white/90" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{worker.user_name}</p>
                          <p className="truncate text-xs text-white/75">
                            {worker.user_id === shift.user_id ? `${shift.position} · ` : 'подменяет · '}до {formatPartTime(worker).split('–')[1]}
                          </p>
                        </div>
                        {worker.user_id !== user.id && data.contacts.get(worker.user_id) && (
                          <ContactButtons contacts={data.contacts.get(worker.user_id)!} name={worker.user_name} variant="glass" />
                        )}
                      </m.li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1.5 font-display text-lg font-semibold uppercase tracking-wide">Сейчас никого нет на смене</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <StatStrip
        stats={[
          { title: 'Смен сегодня', value: view.todayShifts.length, icon: CalendarDays, to: '/shifts' },
          { title: 'Открытых кейсов', value: view.openAssets.length, icon: AlertCircle, to: '/assets' },
          { title: 'Передач смен', value: data.handovers.total, icon: ArrowRightLeft, to: '/handovers' },
          { title: 'Моих часов в месяце', value: data.myHours, icon: Timer, to: '/profile' },
        ]}
      />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <SectionCard title="Смены сегодня" icon={CalendarDays} link="/shifts">
          {view.todayShifts.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {view.todayShifts.map((shift) => (
                <ShiftRow key={shift.id} shift={shift} now={now} showDate={shift.date !== today} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={CalendarDays} title="Смен на сегодня нет" compact />
          )}
        </SectionCard>

        <SectionCard title="Ближайшие смены" icon={Clock}>
          {view.upcomingShifts.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {view.upcomingShifts.map((shift, index) => (
                <ShiftRow
                  key={shift.id}
                  shift={shift}
                  now={now}
                  showDate
                  // Кто примет смену следующим — с ним чаще всего и нужно связаться
                  contacts={index === 0 && shift.user_id !== user.id ? data.contacts.get(shift.user_id) : undefined}
                />
              ))}
            </ul>
          ) : (
            <EmptyState icon={Clock} title="Ближайших смен нет" compact />
          )}
        </SectionCard>

        <SectionCard title="Открытые кейсы" icon={Package} link="/assets">
          {view.openAssets.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {view.openAssets.slice(0, 6).map((asset) => (
                <li key={asset.id} className="flex items-start gap-3 py-3">
                  <CategoryIcon type={asset.asset_type} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900" title={asset.title}>{asset.title}</p>
                    <LastEntryLine entry={asset.last_entry} now={now} />
                  </div>
                  <AssetStatusBadge status={asset.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Package} title="Открытых кейсов нет" compact />
          )}
        </SectionCard>

        <SectionCard title="Последние передачи" icon={ArrowRightLeft} link="/handovers">
          {data.lastByWave.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {data.lastByWave.map((handover) => (
                <div key={handover.id} className="py-3 first:pt-2 last:pb-0">
                  <p className="flex items-center gap-2 text-xs text-gray-500">
                    <WaveBadge wave={handover.wave} />
                    {formatDateTime(handover.created_at)}
                  </p>
                  <p className="mt-2 line-clamp-4 text-sm text-gray-700 text-wrap-force">{handover.handover_notes}</p>
                  {handover.assets.length > 0 && (
                    <p className="mt-2 text-xs font-medium text-gray-500">Кейсов в передаче: {handover.assets.length}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={ArrowRightLeft} title="Передач пока не было" compact />
          )}
        </SectionCard>
      </div>
    </div>
  );
};

export default DashboardPage;
