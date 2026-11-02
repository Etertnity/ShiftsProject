import React from 'react';
import clsx from 'clsx';
import { Wave, WAVE_LABELS } from '../../types';

const TONES: Record<Wave, string> = {
  1: 'bg-amber-50 text-amber-700 ring-amber-200',
  2: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
};

/** Метка волны передачи смен: 1 — сменные день/ночь, 2 — дневные «2 через 2». */
const WaveBadge: React.FC<{ wave: Wave; className?: string }> = ({ wave, className }) => (
  <span
    className={clsx(
      'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
      TONES[wave] ?? TONES[1],
      className,
    )}
  >
    {WAVE_LABELS[wave] ?? WAVE_LABELS[1]}
  </span>
);

export default WaveBadge;
