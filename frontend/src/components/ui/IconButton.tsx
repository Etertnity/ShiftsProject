import React from 'react';
import clsx from 'clsx';
import { LucideIcon } from 'lucide-react';

type Tone = 'default' | 'primary' | 'danger';

const TONES: Record<Tone, string> = {
  default: 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
  primary: 'text-gray-500 hover:bg-primary-50 hover:text-primary-700',
  danger: 'text-gray-500 hover:bg-red-50 hover:text-red-600',
};

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Обязательная подпись — для доступности и всплывающей подсказки */
  label: string;
  tone?: Tone;
  size?: 'sm' | 'md';
}

const IconButton: React.FC<IconButtonProps> = ({ icon: Icon, label, tone = 'default', size = 'md', className, ...rest }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    className={clsx(
      'inline-flex shrink-0 items-center justify-center rounded-lg transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
      size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
      TONES[tone],
      className,
    )}
    {...rest}
  >
    <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden />
  </button>
);

export default IconButton;
