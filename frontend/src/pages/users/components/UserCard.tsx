import React from 'react';
import clsx from 'clsx';
import { KeyRound, Pencil, Shield, Trash2 } from 'lucide-react';
import { ContactList } from '../../../components/users/ContactLinks';
import Avatar from '../../../components/ui/Avatar';
import Badge from '../../../components/ui/Badge';
import IconButton from '../../../components/ui/IconButton';
import { UserAdmin } from '../../../types';

interface UserCardProps {
  user: UserAdmin;
  isSelf: boolean;
  onEdit: (user: UserAdmin) => void;
  onResetPassword: (user: UserAdmin) => void;
  onDelete: (user: UserAdmin) => void;
}

/** Карточка сотрудника для администратора. Логина и пароля здесь нет — только сброс. */
const UserCard: React.FC<UserCardProps> = ({ user, isSelf, onEdit, onResetPassword, onDelete }) => {
  return (
    <article className={clsx('card flex min-w-0 flex-col p-4 sm:p-5', !user.is_active && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <Avatar name={user.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-semibold text-gray-900 [overflow-wrap:anywhere]" title={user.name}>{user.name}</h3>
          <p className="line-clamp-2 text-sm text-gray-500">{user.position}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {isSelf && <Badge className="bg-primary-50 text-primary-700 ring-primary-200">Это вы</Badge>}
            {user.is_admin && (
              <Badge className="bg-violet-50 text-violet-700 ring-violet-200">
                <span className="inline-flex items-center gap-1"><Shield className="h-3 w-3" />Админ</span>
              </Badge>
            )}
            {!user.is_active && <Badge>Отключён</Badge>}
            {user.must_change_password && <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Временный пароль</Badge>}
          </div>
        </div>
        <div className="-mr-1 -mt-1 flex shrink-0">
          <IconButton icon={Pencil} label="Редактировать" tone="primary" size="sm" onClick={() => onEdit(user)} />
          {!isSelf && <IconButton icon={KeyRound} label="Сбросить пароль" tone="primary" size="sm" onClick={() => onResetPassword(user)} />}
          {!isSelf && <IconButton icon={Trash2} label="Удалить" tone="danger" size="sm" onClick={() => onDelete(user)} />}
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <ContactList contacts={user} />
      </div>
    </article>
  );
};

export default UserCard;
