import { Activity, ArrowRightLeft, BookUser, CalendarDays, LayoutDashboard, LucideIcon, Package, Settings, UserRound, Users } from 'lucide-react';

/** Минимальная длина пароля — так же проверяет сервер. */
export const PASSWORD_MIN_LENGTH = 8;

export interface NavItem {
  path: string;
  label: string;
  /** Короткая подпись для нижней панели на телефоне */
  shortLabel: string;
  icon: LucideIcon;
}

/** Рабочие разделы — у всех сотрудников, на телефоне в нижней панели. */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Дашборд', shortLabel: 'Главная', icon: LayoutDashboard },
  { path: '/shifts', label: 'График смен', shortLabel: 'Смены', icon: CalendarDays },
  { path: '/handovers', label: 'Передачи смен', shortLabel: 'Передачи', icon: ArrowRightLeft },
  { path: '/assets', label: 'Активы', shortLabel: 'Активы', icon: Package },
  { path: '/monitor', label: 'ICMP-монитор', shortLabel: 'ICMP', icon: Activity },
];

/** Справочник коллег — у всех; на телефоне в меню пользователя (нижняя панель уже заполнена). */
export const TEAM_NAV_ITEM: NavItem = { path: '/team', label: 'Команда', shortLabel: 'Команда', icon: BookUser };

export const PROFILE_NAV_ITEM: NavItem = { path: '/profile', label: 'Мой профиль', shortLabel: 'Профиль', icon: UserRound };

/** Только для администраторов: данные сотрудников и настройки системы. */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { path: '/users', label: 'Сотрудники', shortLabel: 'Сотрудники', icon: Users },
  { path: '/settings', label: 'Настройки', shortLabel: 'Настройки', icon: Settings },
];
