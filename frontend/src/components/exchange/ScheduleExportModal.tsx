import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import { exchangeApi } from '../../api';
import { getErrorMessage } from '../../utils/errors';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Modal from '../ui/Modal';

interface ScheduleExportModalProps {
  open: boolean;
  onClose: () => void;
  /** Месяц, открытый на странице (YYYY-MM) — с него начинается выгрузка */
  month: string;
}

/** Выгрузка графика в формате файла «График сменных»: лист «Общее», месяцы блоками. */
const ScheduleExportModal: React.FC<ScheduleExportModalProps> = ({ open, onClose, month }) => {
  const [range, setRange] = useState<[string, string]>([month, month]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setRange([month, month]);
  }, [open, month]);

  const [from, to] = range;
  const invalid = !from || !to || from > to;

  const download = async () => {
    setLoading(true);
    try {
      await exchangeApi.exportSchedule(from, to);
      toast.success('График скачан');
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось выгрузить график'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="График в Excel"
      description="В том же виде, что и файл графика сменных"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button icon={Download} loading={loading} disabled={invalid} onClick={download}>Скачать .xlsx</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="С месяца" htmlFor="schedule-from">
            <input id="schedule-from" type="month" className="form-input min-w-0" value={from} onChange={(e) => setRange([e.target.value, to])} />
          </Field>
          <Field label="По месяц" htmlFor="schedule-to" error={invalid && from && to ? 'Конец раньше начала' : undefined}>
            <input id="schedule-to" type="month" className="form-input min-w-0" value={to} onChange={(e) => setRange([from, e.target.value])} />
          </Field>
        </div>
        <ul className="space-y-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
          <li>Лист «Общее», каждый месяц — отдельный блок: число, день недели, смена д/н</li>
          <li>У каждого сотрудника две строки: «отработано» и «станд.график», в ячейках — часы</li>
          <li>Зелёный — отработано, жёлтый — замена или перенос, справа — количество смен</li>
        </ul>
      </div>
    </Modal>
  );
};

export default ScheduleExportModal;
