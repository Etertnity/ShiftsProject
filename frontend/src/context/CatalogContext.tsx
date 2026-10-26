import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { settingsApi } from '../api';
import Spinner from '../components/ui/Spinner';
import { Catalog, Category, StatusOption } from '../types';

interface CatalogContextValue {
  categories: Category[];
  /** Категории, доступные для новых активов */
  activeCategories: Category[];
  statuses: StatusOption[];
  getCategory: (key: string) => Category;
  getStatus: (key: string) => StatusOption;
  /** Статус требует внимания смены (не закрыт) */
  isOpenStatus: (key: string) => boolean;
  defaultStatus: StatusOption | undefined;
  reload: () => Promise<void>;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

// Если в данных встретился ключ, которого уже нет в справочнике — показываем его как есть
const fallbackCategory = (key: string): Category => ({
  id: -1, key, name: key, description: null, color: 'slate', icon: 'folder', position: 999,
  is_active: false, auto_include_in_handover: false, fields: [], asset_count: 0,
});

const fallbackStatus = (key: string): StatusOption => ({
  id: -1, key, name: key, color: 'slate', is_closed: false, is_default: false, position: 999, asset_count: 0,
});

/** Справочники категорий и статусов, которые настраивает администратор. Загружаются один раз после входа. */
export const CatalogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    try {
      setCatalog(await settingsApi.getCatalog());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo<CatalogContextValue | null>(() => {
    if (!catalog) return null;
    const categoryMap = new Map(catalog.categories.map((c) => [c.key, c]));
    const statusMap = new Map(catalog.statuses.map((s) => [s.key, s]));
    return {
      categories: catalog.categories,
      activeCategories: catalog.categories.filter((c) => c.is_active),
      statuses: catalog.statuses,
      getCategory: (key) => categoryMap.get(key) ?? fallbackCategory(key),
      getStatus: (key) => statusMap.get(key) ?? fallbackStatus(key),
      isOpenStatus: (key) => !(statusMap.get(key)?.is_closed ?? false),
      defaultStatus: catalog.statuses.find((s) => s.is_default) ?? catalog.statuses.find((s) => !s.is_closed),
      reload,
    };
  }, [catalog, reload]);

  if (!value) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-gray-500">
        {error ? (
          <>
            <p>Не удалось загрузить настройки.</p>
            <button type="button" onClick={reload} className="font-medium text-primary-600 hover:text-primary-700">
              Повторить
            </button>
          </>
        ) : (
          <Spinner size="lg" />
        )}
      </div>
    );
  }

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
};

export const useCatalog = (): CatalogContextValue => {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used within CatalogProvider');
  return ctx;
};
