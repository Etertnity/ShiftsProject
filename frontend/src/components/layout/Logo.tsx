import React from 'react';
import clsx from 'clsx';

interface LogoProps {
  compact?: boolean;
  /** Светлый текст — для тёмного/цветного фона (экран входа) */
  inverted?: boolean;
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ compact, inverted, className }) => (
  <div className={clsx('flex items-center gap-2.5', className)}>
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-sky-500 text-sm font-bold text-white shadow-sm">
      IS
    </span>
    {!compact && (
      <span className="leading-tight">
        <span className={clsx('block text-[11px] font-semibold uppercase tracking-[0.18em]', inverted ? 'text-white/70' : 'text-gray-400')}>In-serv</span>
        <span className={clsx('block text-base font-bold', inverted ? 'text-white' : 'text-gray-900')}>Shift Control</span>
      </span>
    )}
  </div>
);

export default Logo;
