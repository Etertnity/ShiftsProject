import React from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { m } from 'motion/react';
import { LogOut, Shield } from 'lucide-react';
import { ADMIN_NAV_ITEMS, NAV_ITEMS, NavItem, PROFILE_NAV_ITEM, TEAM_NAV_ITEM } from '../../constants/navigation';
import { useAuth, useCurrentUser } from '../../context/AuthContext';
import Avatar from '../ui/Avatar';
import IconButton from '../ui/IconButton';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

const SidebarLink: React.FC<{ item: NavItem }> = ({ item: { path, label, icon: Icon } }) => (
  <NavLink
    to={path}
    end={path === '/'}
    className={({ isActive }) =>
      clsx(
        'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        isActive ? 'text-white' : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-900',
      )
    }
  >
    {({ isActive }) => (
      <>
        {/* Подсветка «перетекает» к выбранному пункту */}
        {isActive && (
          <m.span
            layoutId="sidebar-active"
            className="absolute inset-0 -z-10 rounded-xl bg-white/[0.07] shadow-[inset_3px_0_0_0_theme(colors.accent.400)]"
            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          />
        )}
        <Icon className={clsx('h-5 w-5 shrink-0', isActive && 'text-accent-400')} aria-hidden />
        {label}
      </>
    )}
  </NavLink>
);

/** Боковое меню для экранов от 1024px. */
const Sidebar: React.FC = () => {
  const user = useCurrentUser();
  const { logout } = useAuth();

  return (
    // dark — меню всегда «ночное», как ходовая рубка, в обеих темах
    <aside className="dark fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/5 bg-gradient-to-b from-navy-900 to-navy-950 lg:flex">
      <div className="px-5 py-5">
        <Logo />
      </div>

      <nav className="isolate flex-1 space-y-1 overflow-y-auto px-3" aria-label="Основное меню">
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.path} item={item} />
        ))}
        <SidebarLink item={TEAM_NAV_ITEM} />
        {user.is_admin && (
          <>
            <p className="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">Администрирование</p>
            {ADMIN_NAV_ITEMS.map((item) => (
              <SidebarLink key={item.path} item={item} />
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-white/5 p-3">
        <div className="flex items-center gap-1">
          {/* Карточка пользователя — вход в «Мой профиль» */}
          <NavLink
            to={PROFILE_NAV_ITEM.path}
            title={PROFILE_NAV_ITEM.label}
            className={({ isActive }) =>
              clsx('flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 transition-colors', isActive ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]')
            }
          >
            <Avatar name={user.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
              <p className="flex items-center gap-1 truncate text-xs text-gray-500">
                {user.is_admin && <Shield className="h-3 w-3 shrink-0 text-accent-400" aria-label="Администратор" />}
                <span className="truncate">{user.position}</span>
              </p>
            </div>
          </NavLink>
          <ThemeToggle className="!h-8 !w-8" />
          <IconButton icon={LogOut} label="Выйти" onClick={logout} size="sm" />
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
