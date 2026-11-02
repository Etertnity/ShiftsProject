import React from 'react';
import { Link } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';
import AnimatedNumber from '../../../components/motion/AnimatedNumber';

export interface Stat {
  title: string;
  value: number;
  icon: LucideIcon;
  to: string;
  /** Подпись мелким шрифтом под числом */
  hint?: string;
}

/**
 * Полоса показателей под баннером: крупные цифры узким шрифтом,
 * «золотые» иконки, разделители. На телефоне — сетка 2×2.
 */
const StatStrip: React.FC<{ stats: Stat[] }> = ({ stats }) => (
  <div className="card grid grid-cols-2 overflow-hidden lg:grid-cols-4">
    {stats.map(({ title, value, icon: Icon, to, hint }, index) => (
      <Link
        key={title}
        to={to}
        className={[
          'group flex min-w-0 items-center gap-3 p-4 transition-colors hover:bg-gray-50 sm:gap-4 sm:p-5',
          // Разделители: вертикальные между колонками, горизонтальный между рядами на телефоне
          index % 2 === 1 ? 'border-l border-gray-100' : '',
          index >= 2 ? 'border-t border-gray-100 lg:border-t-0' : '',
          index === 2 ? 'lg:border-l' : '',
        ].join(' ')}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent-400/40 text-accent-500 transition-colors group-hover:bg-accent-400/10">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block font-display text-2xl font-semibold leading-none tracking-wide text-gray-900 sm:text-3xl">
            <AnimatedNumber value={value} />
          </span>
          <span className="mt-1 block text-xs font-medium leading-snug text-gray-500 sm:text-sm">{title}</span>
          {hint && <span className="block text-[11px] text-gray-400">{hint}</span>}
        </span>
      </Link>
    ))}
  </div>
);

export default StatStrip;
