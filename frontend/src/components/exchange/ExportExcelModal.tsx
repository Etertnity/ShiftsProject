import React, { useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import { exchangeApi } from '../../api';
import { addDays, currentMonth, dateKeyFromParts, todayKey } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Modal from '../ui/Modal';

type Preset = 'month' | 'week' | 'all' | 'custom';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month', label: 'Этот месяц' },
  { key: 'week', label: '7 дней' },
  { key: 'all', label: 'Всё время' },
  { key: 'custom', label: 'Период' },
];

const presetRange = (preset: Preset): [string, string] => {
  const today = todayKey();
  if (preset === 'week') return [addDays(today, -6), today];
  if (preset === 'month') {
    const { year, month } = currentMonth();
    return [dateKeyFromParts(year, month, 1), today];
  }
  return ['', ''];
};

interface ExportExcelModalProps {
  open: boolean;
  onClose: () => void;
}

/** Выгрузка в Excel: лист «Передачи» в формате журнала смен, все кейсы и история за выбранный период. */
const ExportExcelModal: React.FC<ExportExcelModalProps> = ({ open, onClose }) => {
  const [preset, setPreset] = useState<Preset>('month');
  const [custom, setCustom] = useState<[string, string]>(presetRange('month'));
  const [loading, setLoading] = useState(false);

  const [from, to] = preset === 'custom' ? custom : presetRange(preset);
  const invalid = preset === 'custom' && (!from || !to || from > to);

  const download = async () => {
    setLoading(true);
    try {
      await exchangeApi.exportXlsx(from, to);
      toast.success('Файл Excel скачан');
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось выгрузить данные'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Выгрузка в Excel"
      description="Передачи в виде журнала, все кейсы и история изменений"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button icon={Download} loading={loading} disabled={invalid} onClick={download}>Скачать .xlsx</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 xs:grid-cols-4" role="radiogroup" aria-label="Период">
          {PRESETS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={preset === key}
              onClick={() => setPreset(key)}
              className={clsx(
                'rounded-lg px-2 py-1.5 text-sm font-medium transition-colors',
                preset === key ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="С" htmlFor="export-from">
              <input id="export-from" type="date" className="form-input min-w-0" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} />
            </Field>
            <Field label="По" htmlFor="export-to" error={invalid && from && to ? 'Конец раньше начала' : undefined}>
              <input id="export-to" type="date" className="form-input min-w-0" value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} />
            </Field>
          </div>
        )}
        <ul className="space-y-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
          <li><b className="font-medium text-gray-900">Передачи</b> — строка на смену, кейсы по категориям: «N) Open/Continue/Close CASE#… — что сделано»</li>
          <li><b className="font-medium text-gray-900">Кейсы</b> — все кейсы с текущим статусом и последней записью</li>
          <li><b className="font-medium text-gray-900">История</b> — каждое изменение кейсов за период</li>
        </ul>
      </div>
    </Modal>
  );
};

export default ExportExcelModal;
