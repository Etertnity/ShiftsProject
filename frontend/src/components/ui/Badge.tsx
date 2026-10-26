import React from 'react';
import clsx from 'clsx';

interface BadgeProps {
  /** Классы цвета, например из constants/assets: "bg-green-50 text-green-700 ring-green-200" */
  className?: string;
  children: React.ReactNode;
  dot?: string;
}

const Badge: React.FC<BadgeProps> = ({ className, children, dot }) => (
  <span
    className={clsx(
      'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
      className ?? 'bg-gray-100 text-gray-700 ring-gray-200',
    )}
  >
    {dot && <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', dot)} aria-hidden />}
    <span className="truncate">{children}</span>
  </span>
);

export default Badge;
