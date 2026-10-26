import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, action, compact }) => (
  <div className={compact ? 'py-6 text-center' : 'px-4 py-12 text-center'}>
    <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
      <Icon className="h-5 w-5" aria-hidden />
    </div>
    <p className="font-medium text-gray-900">{title}</p>
    {description && <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

export default EmptyState;
