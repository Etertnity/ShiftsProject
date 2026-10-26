import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AtSign, CalendarDays, Clock, KeyRound, Moon, Save, Shield, Sun, UserRound } from 'lucide-react';
import { authApi, shiftsApi } from '../../api';
import AnimatedNumber from '../../components/motion/AnimatedNumber';
import ChangePasswordForm from '../../components/users/ChangePasswordForm';
import ContactFields, { ContactValues, validateContacts } from '../../components/users/ContactFields';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import { useAuth, useCurrentUser } from '../../context/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { ContactVisibility } from '../../types';
import { currentMonth, dateKeyFromParts, daysInMonth, formatDate, MONTH_NAMES } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';

const Section: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode; description?: string }> = ({
  title,
  icon: Icon,
  description,
  children,
}) => (
  <section className="card p-4 sm:p-6">
    <h2 className="flex items-center gap-2 font-semibold text-gray-900">
      <Icon className="h-4 w-4 text-gray-400" aria-hidden /> {title}
    </h2>
    {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

const Stat: React.FC<{ label: string; value: number; suffix?: string; icon: React.ElementType; tone: string }> = ({ label, value, suffix, icon: Icon, tone }) => (
  <div className="flex items-center gap-2.5 rounded-xl bg-gray-50 p-3">
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
    <div className="min-w-0">
      <p className="text-lg font-bold leading-none text-gray-900">
        <AnimatedNumber value={value} />
        {suffix && <span className="ml-1 text-sm font-medium text-gray-500">{suffix}</span>}
      </p>
      <p className="mt-1 text-xs leading-snug text-gray-500">{label}</p>
    </div>
  </div>
);

/** Профиль сотрудника: свои данные, пароль и отработанные смены. */
const ProfilePage: React.FC = () => {
  const user = useCurrentUser();
  const { setUser } = useAuth();
  const [form, setForm] = useState<ContactValues>({ name: '', position: '', phone: '', telegram_id: '', email: '' });
  const [visibility, setVisibility] = useState<ContactVisibility>({ show_phone: false, show_telegram: true, show_email: true });
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({ name: user.name, position: user.position, phone: user.phone ?? '', telegram_id: user.telegram_id ?? '', email: user.email ?? '' });
    setVisibility({ show_phone: user.show_phone, show_telegram: user.show_telegram, show_email: user.show_email });
  }, [user]);

  const month = currentMonth();
  const monthFrom = dateKeyFromParts(month.year, month.month, 1);
  const monthTo = dateKeyFromParts(month.year, month.month, daysInMonth(month));
  const { data: stats } = useAsyncData(
    async () => {
      const [monthStats, yearStats] = await Promise.all([
        shiftsApi.stats(monthFrom, monthTo),
        shiftsApi.stats(`${month.year}-01-01`, `${month.year}-12-31`),
      ]);
      const mine = (s: typeof monthStats) => s.items.find((i) => i.user_id === user.id);
      return { month: mine(monthStats), year: mine(yearStats) };
    },
    [monthFrom, monthTo, user.id],
    'Не удалось загрузить статистику смен',
  );

  const errors = validateContacts(form);
  const dirty =
    form.name !== user.name ||
    form.position !== user.position ||
    form.phone !== (user.phone ?? '') ||
    form.telegram_id !== (user.telegram_id ?? '') ||
    form.email !== (user.email ?? '') ||
    visibility.show_phone !== user.show_phone ||
    visibility.show_telegram !== user.show_telegram ||
    visibility.show_email !== user.show_email;

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true);
    try {
      const saved = await authApi.updateProfile({
        name: form.name.trim(),
        position: form.position.trim(),
        phone: form.phone.trim(),
        telegram_id: form.telegram_id.trim().replace(/^@/, ''),
        email: form.email.trim(),
        ...visibility,
      });
      setUser(saved);
      setSubmitted(false);
      toast.success('Профиль сохранён');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось сохранить профиль'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader title="Мой профиль" description="Логин и пароль видите только вы" />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <div className="space-y-4 sm:space-y-5">
          {/* Кто я */}
          <section className="card overflow-hidden">
            <div className="h-16 bg-gradient-to-r from-primary-500 to-sky-400" aria-hidden />
            <div className="-mt-8 px-4 pb-5 sm:px-6">
              <Avatar name={user.name} size="lg" className="!h-16 !w-16 !text-xl ring-4 ring-surface" />
              <h2 className="mt-3 text-lg font-bold text-gray-900 [overflow-wrap:anywhere]">{user.name}</h2>
              <p className="text-sm text-gray-500">{user.position}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {user.is_admin && (
                  <Badge className="bg-violet-50 text-violet-700 ring-violet-200">
                    <span className="inline-flex items-center gap-1"><Shield className="h-3 w-3" />Администратор</span>
                  </Badge>
                )}
              </div>
              <dl className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <AtSign className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                  <dt className="sr-only">Логин</dt>
                  <dd className="truncate">{user.username}</dd>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <CalendarDays className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                  <dt className="sr-only">В системе с</dt>
                  <dd>в системе с {formatDate(user.created_at)}</dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Мои смены */}
          <Section title="Мои смены" icon={Clock} description={`${MONTH_NAMES[month.month]} и весь ${month.year} год`}>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="смен за месяц" value={stats?.month?.worked_shifts ?? 0} icon={Sun} tone="bg-amber-50 text-amber-600" />
              <Stat label="часов за месяц" value={Math.round(stats?.month?.worked_hours ?? 0)} suffix="ч" icon={Clock} tone="bg-primary-50 text-primary-600" />
              <Stat label={`смен за ${month.year}`} value={stats?.year?.worked_shifts ?? 0} icon={Moon} tone="bg-indigo-50 text-indigo-600" />
              <Stat label={`часов за ${month.year}`} value={Math.round(stats?.year?.worked_hours ?? 0)} suffix="ч" icon={Clock} tone="bg-emerald-50 text-emerald-600" />
            </div>
            {!!stats?.month && stats.month.planned_shifts > stats.month.worked_shifts && (
              <p className="mt-3 text-xs text-gray-500">
                Ещё запланировано в этом месяце: {stats.month.planned_shifts - stats.month.worked_shifts} смен,{' '}
                {Math.round(stats.month.planned_hours - stats.month.worked_hours)} ч
              </p>
            )}
          </Section>
        </div>

        <div className="space-y-4 sm:space-y-5 lg:col-span-2">
          <Section
            title="Личные данные"
            icon={UserRound}
            description="Отмеченные «Видно коллегам» контакты показываются в разделе «Команда» и на кнопках связи с дежурным. Администраторы видят все контакты."
          >
            <form onSubmit={saveProfile} className="space-y-4" noValidate>
              <ContactFields
                idPrefix="profile"
                values={form}
                errors={submitted ? errors : {}}
                onChange={(key, value) => setForm((prev) => ({ ...prev, [key]: value }))}
                visibility={visibility}
                onVisibilityChange={(key, value) => setVisibility((prev) => ({ ...prev, [key]: value }))}
              />
              <div className="flex justify-end">
                <Button type="submit" icon={Save} loading={saving} disabled={!dirty}>Сохранить</Button>
              </div>
            </form>
          </Section>

          <Section title="Пароль" icon={KeyRound} description="Если забудете пароль, администратор выдаст временный — его нужно будет сменить при входе.">
            <ChangePasswordForm onChanged={() => setUser({ ...user, must_change_password: false })} />
          </Section>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
