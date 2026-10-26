import React from 'react';
import clsx from 'clsx';
import { getInitials } from '../../utils/strings';

const PALETTE = [
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
];

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base' };

const Avatar: React.FC<AvatarProps> = ({ name, size = 'md', className }) => {
  // Цвет зависит от имени, чтобы у сотрудника он был стабильным
  const hash = Array.from(name).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return (
    <span
      aria-hidden
      className={clsx(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold',
        PALETTE[hash % PALETTE.length],
        SIZES[size],
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
};

export default Avatar;
