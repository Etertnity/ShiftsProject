import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { BookUser, Search, Settings2 } from 'lucide-react';
import { usersApi } from '../../api';
import MotionItem from '../../components/motion/MotionItem';
import { ContactList } from '../../components/users/ContactLinks';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import PageHeader from '../../components/ui/PageHeader';
import { PageLoader } from '../../components/ui/Spinner';
import { useCurrentUser } from '../../context/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { User, UserPublic } from '../../types';
import { pluralize } from '../../utils/strings';

/** Свою карточку показываем так, как её видят коллеги: только разрешённые контакты. */
const asColleaguesSee = (me: User): UserPublic => ({
  ...me,
  phone: me.show_phone ? me.phone : null,
  telegram_id: me.show_telegram ? me.telegram_id : null,
  email: me.show_email ? me.email : null,
});

/** Справочник «Команда» — для всех: имя, должность и контакты, которые сотрудник разрешил показывать. */
const TeamPage: React.FC = () => {
  const currentUser = useCurrentUser();
  const [query, setQuery] = useState('');
  const { data: users, loading } = useAsyncData(() => usersApi.getAllPublic(), [], 'Не удалось загрузить сотрудников');

  const team = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? [])
      .filter((u) => u.is_active)
      .map((u) => (u.id === currentUser.id ? asColleaguesSee(currentUser) : u))
      .sort((a, b) => Number(b.id === currentUser.id) - Number(a.id === currentUser.id) || a.name.localeCompare(b.name))
      .filter((u) => !q || [u.name, u.position, u.email, u.telegram_id, u.phone].some((v) => v?.toLowerCase().includes(q)));
  }, [users, query, currentUser]);

  const total = users?.filter((u) => u.is_active).length ?? 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Команда"
        description={
          users
            ? `${total} ${pluralize(total, ['сотрудник', 'сотрудника', 'сотрудников'])} · контакты, которые коллеги открыли для всех`
            : undefined
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="search"
          aria-label="Поиск по команде"
          placeholder="Поиск по имени, должности, контактам"
          className="form-input pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : team.length === 0 ? (
        <div className="card">
          <EmptyState icon={BookUser} title={query ? 'Никого не нашли' : 'В команде пока никого нет'} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {team.map((user, index) => {
              const isSelf = user.id === currentUser.id;
              return (
                <MotionItem key={user.id} index={index} className="flex min-w-0 flex-col [&>*]:flex-1">
                  <article className="card flex min-w-0 flex-col p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <Avatar name={user.name} size="lg" />
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 font-semibold text-gray-900 [overflow-wrap:anywhere]" title={user.name}>{user.name}</h3>
                        <p className="line-clamp-2 text-sm text-gray-500">{user.position}</p>
                        {isSelf && <Badge className="mt-1.5 bg-primary-50 text-primary-700 ring-primary-200">Это вы</Badge>}
                      </div>
                    </div>
                    <div className="mt-4 flex-1 border-t border-gray-100 pt-3">
                      <ContactList contacts={user} empty={isSelf ? 'Коллеги не видят ваших контактов' : 'Контакты скрыты или не указаны'} />
                    </div>
                    {isSelf && (
                      <Link to="/profile" className="mt-3 inline-flex items-center gap-1.5 self-start text-xs font-medium text-primary-600 hover:text-primary-700">
                        <Settings2 className="h-3.5 w-3.5" aria-hidden /> Что видят коллеги — в профиле
                      </Link>
                    )}
                  </article>
                </MotionItem>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default TeamPage;
