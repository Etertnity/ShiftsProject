import React from 'react';
import { HTMLMotionProps, m } from 'motion/react';

interface MotionItemProps extends HTMLMotionProps<'div'> {
  /** Порядковый номер в списке — для появления «лесенкой» (после 8-го без задержки) */
  index?: number;
}

/**
 * Элемент списка: появляется снизу с лёгкой задержкой, при удалении плавно исчезает,
 * а соседи сдвигаются на освободившееся место (layout). Используется внутри AnimatePresence.
 */
const MotionItem: React.FC<MotionItemProps> = ({ index = 0, children, ...rest }) => (
  <m.div
    layout="position"
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0, transition: { duration: 0.25, delay: Math.min(index, 8) * 0.035 } }}
    exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
    {...rest}
  >
    {children}
  </m.div>
);

export default MotionItem;
