import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2 } from 'lucide-react';
import { monitoringApi } from '../../../api';
import Button from '../../../components/ui/Button';
import Field from '../../../components/ui/Field';
import Modal from '../../../components/ui/Modal';
import { Vessel } from '../../../types';
import { getErrorMessage } from '../../../utils/errors';

interface VesselFormModalProps {
  open: boolean;
  vessel: Vessel | null;
  onClose: () => void;
  onSaved: (vessel: Vessel) => void;
}

/** Item ID из числа или ссылки на график Zabbix — подсказываем сразу, ещё до сохранения. */
const parseItemId = (value: string): string | null => {
  const s = value.trim();
  if (/^\d+$/.test(s)) return s;
  const match = s.match(/itemids(?:%5B%5D|\[\])=(\d+)/i) || s.match(/[?&]itemid=(\d+)/i);
  return match ? match[1] : null;
};

const VesselFormModal: React.FC<VesselFormModalProps> = ({ open, vessel, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [item, setItem] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setName(vessel?.name ?? '');
    setItem(vessel?.item_id ?? '');
  }, [open, vessel]);

  const itemId = parseItemId(item);
  const errors = {
    name: !name.trim() ? 'Укажите название судна' : undefined,
    item: !item.trim() ? 'Вставьте ссылку на график или Item ID' : !itemId ? 'Не нашёл Item ID в ссылке — нужна ссылка вида …itemids%5B%5D=12345' : undefined,
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (errors.name || errors.item) return;
    setSaving(true);
    try {
      const saved = vessel
        ? await monitoringApi.updateVessel(vessel.id, { name: name.trim(), item: item.trim() })
        : await monitoringApi.createVessel(name.trim(), item.trim());
      toast.success(vessel ? `«${saved.name}» обновлено` : `«${saved.name}» добавлено`);
      onSaved(saved);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось сохранить судно'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={vessel ? 'Редактировать судно' : 'Добавить судно'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" form="vessel-form" loading={saving}>{vessel ? 'Сохранить' : 'Добавить'}</Button>
        </>
      }
    >
      <form id="vessel-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Название судна" htmlFor="vessel-name" required error={submitted ? errors.name : undefined}>
          <input id="vessel-name" className="form-input" autoFocus placeholder="Например: Arctic Storm" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field
          label="Ссылка на график Zabbix или Item ID"
          htmlFor="vessel-item"
          required
          error={submitted ? errors.item : undefined}
          hint="Откройте нужный график в Zabbix и скопируйте адрес из строки браузера — Item ID достанется из ссылки сам"
        >
          <input
            id="vessel-item"
            className="form-input font-mono text-sm"
            placeholder="http://zabbix/history.php?action=showgraph&itemids%5B%5D=12345"
            value={item}
            onChange={(e) => setItem(e.target.value)}
          />
        </Field>
        {itemId && item.trim() !== itemId && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Item ID: <b className="font-mono">{itemId}</b>
          </p>
        )}
      </form>
    </Modal>
  );
};

export default VesselFormModal;
