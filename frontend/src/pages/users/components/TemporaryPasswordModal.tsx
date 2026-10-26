import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';

interface TemporaryPasswordModalProps {
  result: { name: string; password: string } | null;
  onClose: () => void;
}

/** Временный пароль показывается один раз — передайте его сотруднику, при входе он задаст свой. */
const TemporaryPasswordModal: React.FC<TemporaryPasswordModalProps> = ({ result, onClose }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* буфер обмена недоступен — пароль можно выделить вручную */
    }
  };

  return (
    <Modal
      open={!!result}
      onClose={onClose}
      title="Пароль сброшен"
      description={result ? `Временный пароль для: ${result.name}` : undefined}
      size="sm"
      footer={<Button onClick={onClose}>Готово</Button>}
    >
      {result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-primary-300 bg-primary-50/60 p-3">
            <code className="min-w-0 flex-1 select-all break-all text-center font-mono text-lg font-semibold tracking-wider text-gray-900">
              {result.password}
            </code>
            <Button variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={copy}>
              {copied ? 'Скопировано' : 'Копировать'}
            </Button>
          </div>
          <p className="text-sm text-gray-600">
            Пароль показывается только сейчас. Передайте его сотруднику лично — при входе система попросит задать новый.
          </p>
        </div>
      )}
    </Modal>
  );
};

export default TemporaryPasswordModal;
