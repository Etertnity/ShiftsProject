import React, { useState } from 'react';
import clsx from 'clsx';
import { CircleDot, FolderTree } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import CategoriesSettings from './components/CategoriesSettings';
import StatusesSettings from './components/StatusesSettings';

const TABS = [
  { key: 'categories', label: 'Категории', icon: FolderTree },
  { key: 'statuses', label: 'Статусы', icon: CircleDot },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** Раздел администратора: здесь настраивается всё, что раньше было зашито в код. */
const SettingsPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('categories');

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader title="Настройки" description="Категории кейсов, их поля и статусы" />

      <div className="flex gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:flex-none',
              tab === key ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'categories' ? <CategoriesSettings /> : <StatusesSettings />}
    </div>
  );
};

export default SettingsPage;
