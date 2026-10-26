import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Красивая замена window.confirm: `if (await confirm({ title: 'Удалить?' })) ...` */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(value: boolean) => void>();

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    resolver.current?.(result);
    resolver.current = undefined;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!options}
        onClose={() => close(false)}
        title={options?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>Отмена</Button>
            <Button variant={options?.danger === false ? 'primary' : 'danger'} onClick={() => close(true)} autoFocus>
              {options?.confirmLabel ?? 'Удалить'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">{options?.message ?? 'Это действие нельзя отменить.'}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
};
