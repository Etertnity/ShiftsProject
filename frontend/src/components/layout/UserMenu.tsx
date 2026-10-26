import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import { LogOut, Moon, Sun, SunMoon } from 'lucide-react';
import { ADMIN_NAV_ITEMS, NavItem, PROFILE_NAV_ITEM, TEAM_NAV_ITEM } from '../../constants/navigation';
import { useAuth, useCurrentUser } from '../../context/AuthContext';
import { ThemePreference, useTheme } from '../../context/ThemeContext';
import Avatar from '../ui/Avatar';

const THEME_LABELS: Record<ThemePreference, { label: string; icon: React.ElementType }> = {
  auto: { label: 'Тема: авто', icon: SunMoon },
  light: { label: 'Тема: светлая', icon: Sun },
  dark: { label: 'Тема: тёмная', icon: Moon },
};

const MenuLink: React.FC<{ item: NavItem }> = ({ item: { path, label, icon: Icon } }) => (
  <NavLink
    to={path}
    className={({ isActive }) =>
      clsx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium', isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-100')
    }
  >
    <Icon className="h-4 w-4" aria-hidden />
    {label}
  </NavLink>
);

/** Меню пользователя в шапке телефона: профиль, админ-разделы, тема, выход. */
const UserMenu: React.FC = () => {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const { preference, cyclePreference } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const theme = THEME_LABELS[preference];
  const ThemeIcon = theme.icon;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Меню пользователя"
        className="flex items-center rounded-full p-0.5 ring-primary-500/40 transition hover:ring-2 focus-visible:outline-none focus-visible:ring-2"
      >
        <Avatar name={user.name} size="sm" />
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-40 mt-2 w-64 origin-top-right rounded-2xl border border-gray-200 bg-surface p-2 shadow-pop"
          >
            <div className="flex items-center gap-3 px-2 pb-3 pt-1">
              <Avatar name={user.name} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="truncate text-xs text-gray-500">{user.position}</p>
              </div>
            </div>
            <div className="space-y-0.5 border-t border-gray-100 pt-2">
              <MenuLink item={PROFILE_NAV_ITEM} />
              <MenuLink item={TEAM_NAV_ITEM} />
              {user.is_admin && ADMIN_NAV_ITEMS.map((item) => <MenuLink key={item.path} item={item} />)}
              <button type="button" onClick={cyclePreference} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">
                <ThemeIcon className="h-4 w-4" aria-hidden />
                {theme.label}
              </button>
            </div>
            <div className="mt-2 border-t border-gray-100 pt-2">
              <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50">
                <LogOut className="h-4 w-4" aria-hidden />
                Выйти
              </button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserMenu;
