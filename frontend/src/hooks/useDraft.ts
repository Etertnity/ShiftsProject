import { useCallback, useEffect, useRef, useState } from 'react';

interface StoredDraft<T> {
  value: T;
  savedAt: number;
}

const PREFIX = 'draft:';
// Старые черновики не воскрешаем: через сутки они уже неактуальны
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const read = <T,>(key: string): StoredDraft<T> | null => {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (!parsed || typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

/** При выходе из системы стираем все черновики — следующий человек за этим компьютером их не увидит. */
export const clearAllDrafts = () => {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
};

export const clearDraft = (key: string) => {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
};

/**
 * Автосохранение формы в браузере. Пока `key` равен null, ничего не делает (форма закрыта).
 * Возвращает найденный при открытии черновик — форма сама решает, подставить ли его.
 */
export function useDraft<T>(key: string | null, value: T, enabled = true) {
  const [restored, setRestored] = useState<StoredDraft<T> | null>(null);
  const loadedKey = useRef<string | null>(null);

  // Черновик ищем один раз при открытии формы с этим ключом
  useEffect(() => {
    if (!key) {
      loadedKey.current = null;
      setRestored(null);
      return;
    }
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    setRestored(read<T>(key));
  }, [key]);

  useEffect(() => {
    if (!key || !enabled) return undefined;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify({ value, savedAt: Date.now() }));
      } catch {
        /* хранилище недоступно — просто работаем без черновиков */
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [key, value, enabled]);

  const clear = useCallback(() => {
    if (key) clearDraft(key);
    setRestored(null);
  }, [key]);

  const dismiss = useCallback(() => setRestored(null), []);

  return { restored, clear, dismiss };
}
