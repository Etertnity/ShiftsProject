import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Moon, Sun, SunMoon } from 'lucide-react';
import { ThemePreference, useTheme } from '../../context/ThemeContext';

const META: Record<ThemePreference, { icon: React.ElementType; label: string }> = {
  auto: { icon: SunMoon, label: 'Тема: авто (ночью тёмная)' },
  light: { icon: Sun, label: 'Тема: светлая' },
  dark: { icon: Moon, label: 'Тема: тёмная' },
};

/** Переключатель темы: авто → светлая → тёмная. Иконка мягко «проворачивается» при смене. */
const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { preference, cyclePreference } = useTheme();
  const { icon: Icon, label } = META[preference];
  return (
    <button
      type="button"
      onClick={cyclePreference}
      title={label}
      aria-label={label}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 ${className ?? ''}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={preference}
          initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.25 }}
          className="flex"
        >
          <Icon className="h-5 w-5" aria-hidden />
        </m.span>
      </AnimatePresence>
    </button>
  );
};

export default ThemeToggle;
