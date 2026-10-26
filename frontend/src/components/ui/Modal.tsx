import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import { X } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import IconButton from './IconButton';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<Size, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: Size;
  children: React.ReactNode;
  /** Кнопки внизу — всегда видны, тело прокручивается */
  footer?: React.ReactNode;
}

interface Content {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

// Сколько модалок открыто — чтобы блокировка прокрутки снималась только после закрытия последней
let openCount = 0;

/**
 * На телефоне — выезжающая снизу панель во всю ширину, на больших экранах — окно по центру.
 * Закрывается по Esc и клику по фону, блокирует прокрутку страницы, открывается и закрывается анимированно.
 */
const Modal: React.FC<ModalProps> = ({ open, onClose, title, description, size = 'md', children, footer }) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isDesktop = useMediaQuery('(min-width: 640px)');

  // Пока окно уезжает, показываем последнее содержимое — родитель к этому моменту уже мог его очистить
  const lastContent = useRef<Content>({ title, description, children, footer });
  if (open) lastContent.current = { title, description, children, footer };
  const content = lastContent.current;

  useEffect(() => {
    if (!open) return undefined;
    openCount += 1;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);

    // Фокус внутрь окна — но не перехватываем, если autoFocus уже поставил его на поле
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openCount -= 1;
      if (openCount === 0) document.body.style.overflow = '';
    };
  }, [open]);

  const panelMotion = isDesktop
    ? { initial: { opacity: 0, scale: 0.96, y: 8 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.97, y: 4 } }
    : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="presentation">
          <m.div
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <m.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            {...panelMotion}
            transition={isDesktop ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] } : { type: 'spring', damping: 32, stiffness: 380 }}
            className={clsx(
              'relative flex w-full flex-col bg-surface shadow-pop outline-none',
              'max-h-[92vh] max-h-[92dvh] rounded-t-2xl sm:max-h-[min(90vh,900px)] sm:rounded-2xl',
              SIZES[size],
            )}
          >
            {/* «Ручка» панели на телефоне — подсказывает, что это выезжающий лист */}
            <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
              <span className="h-1 w-10 rounded-full bg-gray-300" />
            </div>
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 pb-3 pt-1 sm:px-6 sm:py-4">
              <div className="min-w-0 pt-1">
                <h2 id={titleId} className="text-lg font-semibold text-gray-900">{content.title}</h2>
                {content.description && <p className="mt-0.5 text-sm text-gray-500">{content.description}</p>}
              </div>
              <IconButton icon={X} label="Закрыть" onClick={onClose} className="-mr-2" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">{content.children}</div>
            {content.footer && (
              <div className="pb-safe border-t border-gray-100 bg-gray-50/80 sm:rounded-b-2xl">
                <div className="flex flex-col-reverse gap-2 px-4 py-3 sm:flex-row sm:justify-end sm:px-6">{content.footer}</div>
              </div>
            )}
          </m.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default Modal;
