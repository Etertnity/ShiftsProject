import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { m } from 'motion/react';
import { AlertCircle, ArrowRight, ArrowRightLeft, CalendarDays, Clock, Package, Timer } from 'lucide-react';
import { assetsApi, handoversApi, shiftsApi, usersApi } from '../../api';
import ShiftRow from '../../components/shifts/ShiftRow';
import ShiftTypeIcon from '../../components/shifts/ShiftTypeIcon';
import { ContactButtons } from '../../components/users/ContactLinks';
import SkyBackground from '../../components/visual/SkyBackground';
import { AssetStatusBadge, CategoryIcon } from '../../components/assets/AssetBadges';
import { LastEntryLine } from '../../components/assets/AssetTimeline';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/Spinner';
import { useCurrentUser } from '../../context/AuthContext';
import { useCatalog } from '../../context/CatalogContext';
import { useTheme } from '../../context/ThemeContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useNow } from '../../hooks/useNow';
import { addDays, formatDateTime, formatDayLong, mskDateTime, todayKey } from '../../utils/datetime';
import { currentWorker, findActiveShifts, findUpcomingShifts, formatPartTime, shiftInterval, sortShifts } from '../../utils/shifts';
import StatCard from './components/StatCard';

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
      <h2 className="flex items-center gap-2 font-semibold text-gray-900">
        <Icon className="h-4 w-4 text-gray-400" aria-hidden />
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
  const { isDark } = useTheme();
  const now = useNow();
  const today = todayKey();

  const { data, loading } = useAsyncData(
    async () => {
      // Берём окно ±1 день: этого достаточно для «сегодня», «сейчас» и «ближайших» смен
      const monthStart = `${today.slice(0, 8)}01`;
      const [handovers, shifts, assets, monthStats, team] = await Promise.all([
        // Для дашборда нужна только последняя передача и общее число — весь журнал не грузим
        handoversApi.list(1, 0),
        shiftsApi.getAll({ date_from: addDays(today, -1), date_to: addDays(today, 2) }),
        assetsApi.getAll(),
        shiftsApi.stats(monthStart, today),
        // Контакты для кнопок связи — только те, что коллеги разрешили показывать
        usersApi.getAllPublic().catch(() => []),
      ]);
      // Мои отработанные часы за текущий месяц
      const myHours = Math.round(monthStats.items.find((i) => i.user_id === user.id)?.worked_hours ?? 0);
      const contacts = new Map(team.map((u) => [u.id, u]));
      return { handovers, shifts, assets, myHours, contacts };
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

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <p className="text-sm text-gray-500 first-letter:uppercase">{formatDayLong(today)}</p>
        <h1 className="mt-0.5 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
          {greeting(now)}, {firstName}!
        </h1>
      </div>

      {/* Кто сейчас на смене — на фоне «живого» неба: днём солнце и облака, ночью сияние и звёзды */}
      <section className="relative isolate overflow-hidden rounded-2xl p-4 text-white shadow-card sm:p-6">
        <SkyBackground night={isDark} className="-z-10" />
        <p className="flex items-center gap-1.5 text-sm font-medium text-white/85">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
          </span>
          Сейчас на смене
        </p>
        {view.activeShifts.length > 0 ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {view.activeShifts.map((shift, index) => {
              // Если смену разделили — показываем того, кто на ней прямо сейчас
              const worker = currentWorker(shift, now);
              return (
              <m.li
                key={shift.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * index, duration: 0.3 }}
                className="flex min-w-0 items-center gap-3 rounded-xl bg-white/15 p-3 ring-1 ring-inset ring-white/20 backdrop-blur-md"
              >
                <ShiftTypeIcon shift={shift} className="h-10 w-10 !bg-white/90" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold [text-shadow:0_1px_2px_rgb(0_0_0/0.25)]">{worker.user_name}</p>
                  <p className="truncate text-sm text-white/85">
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
          <p className="mt-2 text-lg font-semibold">Активных смен нет</p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard title="Смен сегодня" value={view.todayShifts.length} icon={CalendarDays} tone="bg-blue-50 text-blue-600" to="/shifts" />
        <StatCard title="Открытых кейсов" value={view.openAssets.length} icon={AlertCircle} tone="bg-orange-50 text-orange-600" to="/assets" />
        <StatCard title="Передач смен" value={data.handovers.total} icon={ArrowRightLeft} tone="bg-violet-50 text-violet-600" to="/handovers" />
        <StatCard title="Моих часов в месяце" value={data.myHours} icon={Timer} tone="bg-emerald-50 text-emerald-600" to="/profile" />
      </div>

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

        <SectionCard title="Последняя передача" icon={ArrowRightLeft} link="/handovers">
          {view.lastHandover ? (
            <div className="pt-2">
              <p className="text-xs text-gray-500">{formatDateTime(view.lastHandover.created_at)}</p>
              <p className="mt-2 line-clamp-6 text-sm text-gray-700 text-wrap-force">{view.lastHandover.handover_notes}</p>
              {view.lastHandover.assets.length > 0 && (
                <p className="mt-3 text-xs font-medium text-gray-500">Активов в передаче: {view.lastHandover.assets.length}</p>
              )}
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
