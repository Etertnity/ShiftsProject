import React from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { COLOR_CLASSES, COLOR_KEYS, COLOR_NAMES, ICON_KEYS, ICONS } from '../../../constants/palette';
import { ColorKey, IconKey } from '../../../types';

export const ColorPicker: React.FC<{ value: ColorKey; onChange: (color: ColorKey) => void }> = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Цвет">
    {COLOR_KEYS.map((color) => (
      <button
        key={color}
        type="button"
        role="radio"
        aria-checked={value === color}
        aria-label={COLOR_NAMES[color]}
        title={COLOR_NAMES[color]}
        onClick={() => onChange(color)}
        className={clsx(
          'flex h-8 w-8 items-center justify-center rounded-full text-white transition-transform hover:scale-110',
          COLOR_CLASSES[color].dot,
          value === color && 'ring-2 ring-gray-900 ring-offset-2 ring-offset-surface',
        )}
      >
        {value === color && <Check className="h-4 w-4" />}
      </button>
    ))}
  </div>
);

export const IconPicker: React.FC<{ value: IconKey; color: ColorKey; onChange: (icon: IconKey) => void }> = ({ value, color, onChange }) => (
  <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Иконка">
    {ICON_KEYS.map((icon) => {
      const Icon = ICONS[icon];
      const selected = value === icon;
      return (
        <button
          key={icon}
          type="button"
          role="radio"
          aria-checked={selected}
          aria-label={icon}
          onClick={() => onChange(icon)}
          className={clsx(
            'flex aspect-square items-center justify-center rounded-lg border transition-colors',
            selected ? clsx(COLOR_CLASSES[color].soft, 'border-transparent ring-2 ring-primary-400') : 'border-gray-200 text-gray-500 hover:bg-gray-50',
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      );
    })}
  </div>
);

/** Простой переключатель «вкл/выкл» с подписью и пояснением. */
export const Toggle: React.FC<{ checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string; disabled?: boolean }> = ({
  checked,
  onChange,
  label,
  hint,
  disabled,
}) => (
  <label className={clsx('flex items-start justify-between gap-3', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
    <span>
      <span className="block text-sm font-medium text-gray-900">{label}</span>
      {hint && <span className="block text-xs text-gray-500">{hint}</span>}
    </span>
    <span className="relative mt-0.5 inline-flex shrink-0">
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-primary-600 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/40" />
      <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
    </span>
  </label>
);
