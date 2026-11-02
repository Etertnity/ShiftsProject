import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { assetsApi, handoversApi } from '../../api';
import { getErrorMessage } from '../../utils/errors';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Modal from '../ui/Modal';

const CONFIRM_WORD = 'ОЧИСТИТЬ';

type Target = 'handovers' | 'assets';

const OPTIONS: { key: Target; title: string; hint: string }[] = [
  { key: 'handovers', title: 'Передачи смен', hint: 'Весь журнал передач' },
  { key: 'assets', title: 'Кейсы', hint: 'Все кейсы всех категорий вместе с историей' },
];

interface ClearDataModalProps {
  open: boolean;
  onClose: () => void;
  onCleared: () => void;
  /** Что отмечено при открытии — раздел, с которого открыли */
  initial: Target;
}

/**
 * Полная очистка передач и/или кейсов — например, чтобы заново загрузить журнал из Excel.
 * Только для администратора; удалённое не восстановить, поэтому нужно вписать слово-подтверждение.
 */
const ClearDataModal: React.FC<ClearDataModalProps> = ({ open, onClose, onCleared, initial }) => {
  const [selected, setSelected] = useState<Set<Target>>(new Set([initial]));
  const [word, setWord] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set([initial]));
      setWord('');
    }
  }, [open, initial]);

  const toggle = (key: Target) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const ready = selected.size > 0 && word.trim().toUpperCase() === CONFIRM_WORD;

  const clear = async () => {
    setLoading(true);
    try {
      const done: string[] = [];
      if (selected.has('handovers')) {
        const result = await handoversApi.clear();
        done.push(`передач: ${result.deleted_handovers}`);
      }
      if (selected.has('assets')) {
        const result = await assetsApi.clear();
        done.push(`кейсов: ${result.deleted_assets}`);
      }
      toast.success(`Удалено ${done.join(', ')}`);
      onCleared();
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось очистить данные'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Очистка данных"
      description="Например, чтобы заново загрузить журнал из Excel"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button variant="danger" icon={Trash2} loading={loading} disabled={!ready} onClick={clear}>Удалить</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-2">
          {OPTIONS.map(({ key, title, hint }) => (
            <label
              key={key}
              className={clsx(
                'flex cursor-pointer gap-3 rounded-xl border px-3 py-2.5',
                selected.has(key) ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:bg-gray-50',
              )}
            >
              <input type="checkbox" className="mt-1 h-4 w-4 accent-red-600" checked={selected.has(key)} onChange={() => toggle(key)} />
              <span>
                <span className="block text-sm font-medium text-gray-900">{title}</span>
                <span className="block text-xs text-gray-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <p className="flex gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Восстановить удалённое нельзя. Если данные могут понадобиться, сначала скачайте их кнопкой «Excel».
        </p>

        <Field label={`Чтобы подтвердить, впишите ${CONFIRM_WORD}`} htmlFor="clear-confirm">
          <input
            id="clear-confirm"
            className="form-input"
            autoComplete="off"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready && !loading) clear();
            }}
          />
        </Field>
      </div>
    </Modal>
  );
};

export default ClearDataModal;
