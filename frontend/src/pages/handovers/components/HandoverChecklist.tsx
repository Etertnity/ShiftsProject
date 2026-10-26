import React, { useState } from 'react';
import { ChevronDown, ListChecks } from 'lucide-react';

const REMINDERS = [
  'Какие кейсы взяли и передали, итог по каждому.',
  'Статус Orange CASE и неотвеченные запросы.',
  'Change management: окна работ, риски, контрольные действия.',
  'Клиентские обращения и ожидаемые ответы.',
  'Наблюдения по инфраструктуре, тревогам и стабильности.',
];

/** Памятка «что не забыть», сворачивается, чтобы не занимать место на телефоне. */
const HandoverChecklist: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <ListChecks className="h-4 w-4 text-primary-500" /> Что не забыть при передаче
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="space-y-2 border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
          {REMINDERS.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default HandoverChecklist;
