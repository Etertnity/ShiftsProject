import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNow } from '../hooks/useNow';
import { APP_TIME_ZONE } from '../utils/datetime';

export type ThemePreference = 'auto' | 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  /** Что реально показано сейчас */
  isDark: boolean;
  /** Сейчас ночная смена по московскому времени (21:00–09:00) — от этого зависит «небо» в шейдере */
  isNightTime: boolean;
  setPreference: (preference: ThemePreference) => void;
  cyclePreference: () => void;
}

const STORAGE_KEY = 'theme';
const ORDER: ThemePreference[] = ['auto', 'light', 'dark'];

const ThemeContext = createContext<ThemeContextValue | null>(null);

const readPreference = (): ThemePreference => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    // По умолчанию — «ночной порт»: морской стиль задуман тёмным. Светлую или авто можно выбрать в меню
    return value === 'light' || value === 'dark' || value === 'auto' ? value : 'dark';
  } catch {
    return 'dark';
  }
};

const mskHour = (date: Date) =>
  Number(date.toLocaleString('ru-RU', { timeZone: APP_TIME_ZONE, hour: '2-digit', hour12: false }));

/** Ночная смена — с 21:00 до 09:00, совпадает с пресетами смен. */
export const isNightHour = (date: Date) => {
  const hour = mskHour(date);
  return hour >= 21 || hour < 9;
};

/**
 * Тема интерфейса. В режиме «авто» тёмная тема включается на ночную смену — меньше слепит
 * в тёмном помещении, — и сама возвращается к светлой утром.
 */
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const now = useNow();
  const isNightTime = isNightHour(now);
  const isDark = preference === 'dark' || (preference === 'auto' && isNightTime);

  useEffect(() => {
    const root = document.documentElement;
    // Плавная смена цветов только в момент переключения, а не при каждом рендере
    root.classList.add('theme-transition');
    root.classList.toggle('dark', isDark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#090d18' : '#f8fafc');
    const timer = window.setTimeout(() => root.classList.remove('theme-transition'), 400);
    return () => window.clearTimeout(timer);
  }, [isDark]);

  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* без сохранения — тема просто не запомнится */
    }
  }, []);

  const cyclePreference = useCallback(() => {
    setPreference(ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length]);
  }, [preference, setPreference]);

  const value = useMemo(
    () => ({ preference, isDark, isNightTime, setPreference, cyclePreference }),
    [preference, isDark, isNightTime, setPreference, cyclePreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
