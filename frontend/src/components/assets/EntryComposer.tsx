import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Send } from 'lucide-react';
import { assetsApi } from '../../api';
import { Asset, AssetEntry } from '../../types';
import { getErrorMessage } from '../../utils/errors';
import Button from '../ui/Button';
import StatusChips from './StatusChips';

interface EntryComposerProps {
  asset: Asset;
  onAdded: (entry: AssetEntry) => void;
}

/** Быстрая запись в историю по ходу смены: что сделано + при необходимости новый статус. */
const EntryComposer: React.FC<EntryComposerProps> = ({ asset, onAdded }) => {
  const [text, setText] = useState('');
  const [status, setStatus] = useState(asset.status);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(asset.status);
  }, [asset.status]);

  const statusChanged = status !== asset.status;
  const canSubmit = !!text.trim() || statusChanged;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const entry = await assetsApi.addEntry(asset.id, {
        text: text.trim() || undefined,
        status: statusChanged ? status : undefined,
      });
      setText('');
      onAdded(entry);
      toast.success('Запись добавлена');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось добавить запись'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 p-3">
      <textarea
        aria-label="Что сделано"
        rows={2}
        className="form-input resize-y"
        placeholder="Что сделано, что дальше…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter — отправить, не отрывая рук от клавиатуры
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <StatusChips value={status} current={asset.status} onChange={setStatus} size="sm" />
        <Button size="sm" icon={Send} loading={saving} disabled={!canSubmit} onClick={submit} className="sm:self-end">
          Добавить
        </Button>
      </div>
    </div>
  );
};

export default EntryComposer;
