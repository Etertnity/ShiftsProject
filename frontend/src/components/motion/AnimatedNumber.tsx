import React, { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';

/** Число, которое «досчитывается» до нового значения — для счётчиков на дашборде. */
const AnimatedNumber: React.FC<{ value: number }> = ({ value }) => {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const from = useRef(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return undefined;
    }
    const controls = animate(from.current, value, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, reduced]);

  return <span className="tabular-nums">{display}</span>;
};

export default AnimatedNumber;
