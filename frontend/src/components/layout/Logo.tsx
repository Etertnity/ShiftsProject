import React from 'react';
import clsx from 'clsx';
import { SatelliteDish } from 'lucide-react';

interface LogoProps {
  compact?: boolean;
  /** Светлый текст — для тёмного/цветного фона (экран входа) */
  inverted?: boolean;
  className?: string;
}

/** Знак: спутниковая тарелка в «золоте маяка», название узким шрифтом — как маркировка на борту. */
const Logo: React.FC<LogoProps> = ({ compact, inverted, className }) => (
  <div className={clsx('flex items-center gap-2.5', className)}>
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-400 text-navy-900 shadow-beacon">
      <SatelliteDish className="h-5 w-5" aria-hidden />
    </span>
    {!compact && (
      <span className="leading-none">
        <span className={clsx('block text-[10px] font-semibold uppercase tracking-[0.24em]', inverted ? 'text-white/65' : 'text-gray-400')}>In-serv</span>
        <span className={clsx('mt-1 block font-display text-[17px] font-semibold uppercase tracking-[0.08em]', inverted ? 'text-white' : 'text-gray-900')}>
          Shift Control
        </span>
      </span>
    )}
  </div>
);

export default Logo;
