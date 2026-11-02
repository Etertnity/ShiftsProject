import React, { Fragment } from 'react';
import clsx from 'clsx';
import { Timesheet, TimesheetCell, TimesheetStatus } from '../../../types';

/** Цвета как в Excel-файле графика сменных */
export const TIMESHEET_COLORS: Record<Exclude<TimesheetStatus, 'plan'>, string> = {
  worked: 'bg-[#92D050] text-navy-900',
  changed: 'bg-[#FFFF00] text-navy-900',
  missed: 'bg-[#FF0000] text-white',
};

export const TIMESHEET_LEGEND: [string, string][] = [
  [TIMESHEET_COLORS.worked, 'отработано'],
  [TIMESHEET_COLORS.changed, 'не по графику — замена или перенос'],
  [TIMESHEET_COLORS.missed, 'не отработано'],
  ['bg-surface', 'ещё впереди'],
];

const KIND_LABEL = { day: 'день', night: 'ночь' };

const formatHours = (value: number) => (Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10).replace('.', ','));
const formatCount = (value: number) => value.toFixed(1).replace('.', ',');

interface TimesheetTableProps {
  sheet: Timesheet;
  /** Число сегодняшнего дня, если показан текущий месяц */
  today?: number;
}

/**
 * Табель месяца в раскладке листа «Общее»: строки «число», «день недели», «смена» (д/н),
 * у каждого сотрудника строки «отработано» и «станд.график», справа — количество смен (часы / 12).
 */
const TimesheetTable: React.FC<TimesheetTableProps> = ({ sheet, today }) => {
  const monthNumber = sheet.month.slice(5, 7);
  const columns = sheet.days.flatMap(({ day }) => (['day', 'night'] as const).map((kind) => ({ day, kind })));
  const index = (cells: TimesheetCell[]) => new Map(cells.map((cell) => [`${cell.day}-${cell.kind}`, cell]));
  const weekend = (weekday: string) => weekday === 'Сб' || weekday === 'Вс';

  const headCell = 'border border-gray-200 px-0.5 py-1 text-center font-medium';
  const labelCell = 'sticky left-0 z-10 border border-gray-200 bg-surface px-3 text-left';

  return (
    <div className="card overflow-x-auto">
      <table className="w-max min-w-full border-collapse text-xs tabular-nums">
        <thead className="text-gray-600">
          <tr>
            <th className={clsx(labelCell, 'py-1 font-medium')}>число</th>
            {sheet.days.map(({ day }) => (
              <th
                key={day}
                colSpan={2}
                className={clsx(headCell, 'text-gray-900', day === today && 'bg-accent-400/25 ring-1 ring-inset ring-accent-400')}
              >
                {day}
              </th>
            ))}
            <th rowSpan={3} className={clsx(headCell, 'w-20 px-2 leading-tight')}>кол-во смен</th>
          </tr>
          <tr>
            <th className={clsx(labelCell, 'py-1 font-medium')}>день недели</th>
            {sheet.days.map(({ day, weekday }) => (
              <th key={day} colSpan={2} className={clsx(headCell, weekend(weekday) && 'text-red-500')}>{weekday}</th>
            ))}
          </tr>
          <tr>
            <th className={clsx(labelCell, 'py-1 font-medium')}>смена</th>
            {columns.map(({ day, kind }) => (
              <th key={`${day}-${kind}`} className={clsx(headCell, 'w-7 min-w-[1.75rem] font-normal text-gray-500')}>
                {kind === 'day' ? 'д' : 'н'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row) => {
            const lines = [
              { label: 'отработано', cells: index(row.worked), count: row.worked_shifts, colored: true },
              { label: 'станд.график', cells: index(row.standard), count: row.standard_shifts, colored: false },
            ];
            return (
              <Fragment key={row.user_id}>
                {lines.map((line, lineIndex) => (
                  <tr key={line.label} className={clsx(lineIndex === 0 && 'border-t-[3px] border-gray-100')}>
                    <th scope="row" className={clsx(labelCell, 'w-32 py-1 font-semibold leading-tight text-gray-900 sm:w-auto sm:whitespace-nowrap sm:py-1.5')}>
                      {row.name} <span className="block font-normal text-gray-500 sm:inline">{line.label}</span>
                    </th>
                    {columns.map(({ day, kind }) => {
                      const cell = line.cells.get(`${day}-${kind}`);
                      return (
                        <td
                          key={`${day}-${kind}`}
                          title={cell ? `${String(day).padStart(2, '0')}.${monthNumber}, ${KIND_LABEL[kind]}: ${formatHours(cell.hours)} ч` : undefined}
                          className={clsx(
                            'h-7 border border-gray-200 text-center',
                            cell && line.colored && cell.status !== 'plan' ? TIMESHEET_COLORS[cell.status] : 'text-gray-900',
                          )}
                        >
                          {cell ? formatHours(cell.hours) : ''}
                        </td>
                      );
                    })}
                    <td className="border border-gray-200 px-2 text-right text-gray-700">{formatCount(line.count)}</td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {sheet.rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-500">В этом месяце смен пока нет</p>}
    </div>
  );
};

export default TimesheetTable;
