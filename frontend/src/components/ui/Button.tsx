import React from 'react';
import clsx from 'clsx';
import { LucideIcon } from 'lucide-react';
import Spinner from './Spinner';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-500 focus-visible:ring-primary-500/40 shadow-sm',
  secondary: 'bg-surface text-gray-700 border border-gray-300 hover:bg-gray-50 focus-visible:ring-gray-400/30 shadow-sm',
  danger: 'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500/40 shadow-sm',
  ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-gray-400/30',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon: Icon, loading, fullWidth, className, children, disabled, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-xl font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size="sm" className="text-current" /> : Icon && <Icon className="h-4 w-4" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export default Button;
