import React from 'react';
import clsx from 'clsx';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-10 w-10 border-[3px]' };

const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className }) => (
  <span
    role="status"
    aria-label="Загрузка"
    className={clsx('inline-block animate-spin rounded-full border-current border-r-transparent text-primary-600', SIZES[size], className)}
  />
);

export const PageLoader: React.FC = () => (
  <div className="flex h-64 items-center justify-center">
    <Spinner size="lg" />
  </div>
);

export default Spinner;
