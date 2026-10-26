import React from 'react';
import { Eye } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/ui/Modal';
import { Vessel } from '../../../types';

interface HiddenVesselsModalProps {
  open: boolean;
  vessels: Vessel[];
  onRestore: (vessels: Vessel[]) => void;
  onClose: () => void;
}

const HiddenVesselsModal: React.FC<HiddenVesselsModalProps> = ({ open, vessels, onRestore, onClose }) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Скрытые суда"
    description="Скрытые суда не загружаются и не показываются, но их можно вернуть"
    footer={
      <>
        {vessels.length > 1 && <Button variant="secondary" onClick={() => onRestore(vessels)}>Вернуть все</Button>}
        <Button onClick={onClose}>Закрыть</Button>
      </>
    }
  >
    {vessels.length === 0 ? (
      <p className="py-4 text-center text-sm text-gray-500">Скрытых судов нет</p>
    ) : (
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
        {vessels.map((vessel) => (
          <li key={vessel.id} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{vessel.name}</span>
            <span className="font-mono text-xs text-gray-400">{vessel.item_id}</span>
            <Button variant="ghost" size="sm" icon={Eye} onClick={() => onRestore([vessel])}>Вернуть</Button>
          </li>
        ))}
      </ul>
    )}
  </Modal>
);

export default HiddenVesselsModal;
