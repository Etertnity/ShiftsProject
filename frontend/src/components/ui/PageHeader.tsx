import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

/** Заголовок раздела: «золотая» черта, узкий шрифт капсом — в стиле морской навигации. */
const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <span aria-hidden className="mb-2 block h-[3px] w-10 rounded-full bg-accent-400" />
      <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-gray-900 sm:text-3xl">{title}</h1>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
  </div>
);

export default PageHeader;
