import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AnimatePresence } from 'motion/react';
import { Search, UserPlus, Users } from 'lucide-react';
import { usersApi } from '../../api';
import MotionItem from '../../components/motion/MotionItem';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import PageHeader from '../../components/ui/PageHeader';
import { PageLoader } from '../../components/ui/Spinner';
import { useCurrentUser } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { UserAdmin } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import { pluralize } from '../../utils/strings';
import TemporaryPasswordModal from './components/TemporaryPasswordModal';
import UserCard from './components/UserCard';
import UserFormModal from './components/UserFormModal';

/** Сотрудники — только для администраторов. Свои данные каждый правит в «Моём профиле». */
const UsersPage: React.FC = () => {
  const currentUser = useCurrentUser();
  const confirm = useConfirm();

  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserAdmin | null>(null);
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null);

  const { data: users, loading, reload } = useAsyncData(() => usersApi.getAll(), [], 'Не удалось загрузить сотрудников');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...(users ?? [])].sort(
      (a, b) => Number(b.id === currentUser.id) - Number(a.id === currentUser.id) || a.name.localeCompare(b.name),
    );
    if (!q) return sorted;
    return sorted.filter((u) => [u.name, u.position, u.email, u.telegram_id, u.phone].some((v) => v?.toLowerCase().includes(q)));
  }, [users, query, currentUser.id]);

  const handleDelete = async (user: UserAdmin) => {
    const ok = await confirm({
      title: 'Удалить сотрудника?',
      message: `${user.name} потеряет доступ к системе. Его смены в истории сохранятся.`,
    });
    if (!ok) return;
    try {
      await usersApi.delete(user.id);
      toast.success('Сотрудник удалён');
      reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось удалить сотрудника'));
    }
  };

  const handleResetPassword = async (user: UserAdmin) => {
    const ok = await confirm({
      title: `Сбросить пароль: ${user.name}?`,
      message: 'Текущий пароль перестанет работать. Вы получите временный пароль, который сотрудник сменит при входе.',
      confirmLabel: 'Сбросить',
    });
    if (!ok) return;
    try {
      const password = await usersApi.resetPassword(user.id);
      setTempPassword({ name: user.name, password });
      reload();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось сбросить пароль'));
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Сотрудники"
        description={users ? `${users.length} ${pluralize(users.length, ['сотрудник', 'сотрудника', 'сотрудников'])} · логины и пароли скрыты` : undefined}
        actions={
          <Button
            icon={UserPlus}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Добавить
          </Button>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="search"
          aria-label="Поиск сотрудников"
          placeholder="Поиск по имени, должности, контактам"
          className="form-input pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <PageLoader />
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={Users} title={query ? 'Никого не нашли' : 'Сотрудников пока нет'} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((user, index) => (
              <MotionItem key={user.id} index={index} className="flex min-w-0 flex-col [&>*]:flex-1">
                <UserCard
                  user={user}
                  isSelf={user.id === currentUser.id}
                  onEdit={(u) => {
                    setEditing(u);
                    setFormOpen(true);
                  }}
                  onResetPassword={handleResetPassword}
                  onDelete={handleDelete}
                />
              </MotionItem>
            ))}
          </AnimatePresence>
        </div>
      )}

      <UserFormModal
        open={formOpen}
        user={editing}
        isSelf={editing?.id === currentUser.id}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          reload();
        }}
      />
      <TemporaryPasswordModal result={tempPassword} onClose={() => setTempPassword(null)} />
    </div>
  );
};

export default UsersPage;
