import React from 'react';
import { m } from 'motion/react';
import { BarChart3, Moon, Split, Sun } from 'lucide-react';
import Avatar from '../../../components/ui/Avatar';
import EmptyState from '../../../components/ui/EmptyState';
import { ShiftStatsItem } from '../../../types';
import { pluralize } from '../../../utils/strings';

interface ShiftStatsPanelProps {
  title: string;
  items: ShiftStatsItem[];
}

const hours = (value: number) => (Number.isInteger(value) ? value : value.toFixed(1));

/** Сколько смен и часов отработал каждый сотрудник за месяц (и сколько ещё по графику). */
const ShiftStatsPanel: React.FC<ShiftStatsPanelProps> = ({ title, items }) => {
  const max = Math.max(1, ...items.map((i) => i.planned_hours));

  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-gray-900">
          <BarChart3 className="h-4 w-4 text-gray-400" aria-hidden /> {title}
        </h2>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-emerald-500" />отработано</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-gray-200" />по графику</span>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={BarChart3} title="Смен в этом месяце нет" compact />
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((item, index) => (
            <li key={item.user_id} className="py-3">
              <div className="flex items-center gap-3">
                <Avatar name={item.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                    <p className="text-sm tabular-nums text-gray-900">
                      <span className="font-semibold">{hours(item.worked_hours)} ч</span>
                      <span className="text-gray-400"> / {hours(item.planned_hours)} ч</span>
                    </p>
                  </div>
                  {/* Полоса: сколько из запланированного уже отработано */}
                  <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
                    <m.div
                      className="absolute inset-y-0 left-0 rounded-full bg-gray-200"
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.planned_hours / max) * 100}%` }}
                      transition={{ duration: 0.6, delay: index * 0.04 }}
                    />
                    <m.div
                      className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.worked_hours / max) * 100}%` }}
                      transition={{ duration: 0.6, delay: 0.1 + index * 0.04 }}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span>
                      {item.worked_shifts} из {item.planned_shifts} {pluralize(item.planned_shifts, ['смены', 'смен', 'смен'])}
                    </span>
                    <span className="flex items-center gap-1"><Sun className="h-3 w-3 text-amber-500" />{item.day_shifts}</span>
                    <span className="flex items-center gap-1"><Moon className="h-3 w-3 text-indigo-500" />{item.night_shifts}</span>
                    {item.partial_shifts > 0 && (
                      <span className="flex items-center gap-1 text-orange-600"><Split className="h-3 w-3" />частично {item.partial_shifts}</span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ShiftStatsPanel;
