import {
  AlertTriangle, Briefcase, Bug, Clock, Database, FileText, Folder, Globe, LucideIcon,
  Mail, MessageSquare, Phone, Server, Shield, Users, Wrench, Zap,
} from 'lucide-react';
import { ColorKey, IconKey } from '../types';

export interface ColorClasses {
  /** Бейдж: фон, текст, рамка */
  badge: string;
  /** Точка-маркер */
  dot: string;
  /** Левая цветная граница карточки */
  accentBorder: string;
  /** Мягкий фон для иконки */
  soft: string;
}

// Tailwind собирает только встречающиеся в коде классы — поэтому все цвета перечислены явно
export const COLOR_CLASSES: Record<ColorKey, ColorClasses> = {
  slate: { badge: 'bg-gray-100 text-gray-700 ring-gray-200', dot: 'bg-gray-400', accentBorder: 'border-l-gray-400', soft: 'bg-gray-100 text-gray-600' },
  sky: { badge: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500', accentBorder: 'border-l-sky-500', soft: 'bg-sky-50 text-sky-600' },
  blue: { badge: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500', accentBorder: 'border-l-blue-500', soft: 'bg-blue-50 text-blue-600' },
  indigo: { badge: 'bg-indigo-50 text-indigo-700 ring-indigo-200', dot: 'bg-indigo-500', accentBorder: 'border-l-indigo-500', soft: 'bg-indigo-50 text-indigo-600' },
  violet: { badge: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500', accentBorder: 'border-l-violet-500', soft: 'bg-violet-50 text-violet-600' },
  pink: { badge: 'bg-pink-50 text-pink-700 ring-pink-200', dot: 'bg-pink-500', accentBorder: 'border-l-pink-500', soft: 'bg-pink-50 text-pink-600' },
  rose: { badge: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500', accentBorder: 'border-l-rose-500', soft: 'bg-rose-50 text-rose-600' },
  red: { badge: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500', accentBorder: 'border-l-red-500', soft: 'bg-red-50 text-red-600' },
  orange: { badge: 'bg-orange-50 text-orange-700 ring-orange-200', dot: 'bg-orange-500', accentBorder: 'border-l-orange-500', soft: 'bg-orange-50 text-orange-600' },
  amber: { badge: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500', accentBorder: 'border-l-amber-500', soft: 'bg-amber-50 text-amber-600' },
  emerald: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', accentBorder: 'border-l-emerald-500', soft: 'bg-emerald-50 text-emerald-600' },
  green: { badge: 'bg-green-50 text-green-700 ring-green-200', dot: 'bg-green-500', accentBorder: 'border-l-green-500', soft: 'bg-green-50 text-green-600' },
  teal: { badge: 'bg-teal-50 text-teal-700 ring-teal-200', dot: 'bg-teal-500', accentBorder: 'border-l-teal-500', soft: 'bg-teal-50 text-teal-600' },
  cyan: { badge: 'bg-cyan-50 text-cyan-700 ring-cyan-200', dot: 'bg-cyan-500', accentBorder: 'border-l-cyan-500', soft: 'bg-cyan-50 text-cyan-600' },
};

export const COLOR_KEYS = Object.keys(COLOR_CLASSES) as ColorKey[];

export const COLOR_NAMES: Record<ColorKey, string> = {
  slate: 'Серый', sky: 'Голубой', blue: 'Синий', indigo: 'Индиго', violet: 'Фиолетовый', pink: 'Розовый',
  rose: 'Малиновый', red: 'Красный', orange: 'Оранжевый', amber: 'Янтарный', emerald: 'Изумрудный',
  green: 'Зелёный', teal: 'Бирюзовый', cyan: 'Циан',
};

export const colorClasses = (color: string): ColorClasses => COLOR_CLASSES[color as ColorKey] ?? COLOR_CLASSES.slate;

export const ICONS: Record<IconKey, LucideIcon> = {
  folder: Folder,
  briefcase: Briefcase,
  globe: Globe,
  wrench: Wrench,
  message: MessageSquare,
  alert: AlertTriangle,
  server: Server,
  shield: Shield,
  phone: Phone,
  bug: Bug,
  zap: Zap,
  clock: Clock,
  mail: Mail,
  users: Users,
  database: Database,
  file: FileText,
};

export const ICON_KEYS = Object.keys(ICONS) as IconKey[];

export const iconFor = (icon: string): LucideIcon => ICONS[icon as IconKey] ?? Folder;
