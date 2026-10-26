import { ComponentType, lazy } from 'react';

const RELOAD_KEY = 'chunk-reload-at';
// Не перезагружаем страницу чаще раза в минуту — иначе при упавшем сервере будет бесконечный цикл
const RELOAD_COOLDOWN_MS = 60_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isChunkError = (error: unknown) =>
  error instanceof Error && (error.name === 'ChunkLoadError' || /Loading (CSS )?chunk|dynamically imported module/i.test(error.message));

const reloadedRecently = () => {
  try {
    return Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) ?? 0) < RELOAD_COOLDOWN_MS;
  } catch {
    return true;
  }
};

/**
 * React.lazy, который переживает сбой загрузки чанка.
 *
 * Чанк может не загрузиться из-за сети или после деплоя: у открытой вкладки старые имена файлов,
 * а на сервере их уже нет. Сначала повторяем запрос, затем один раз перезагружаем страницу
 * (подтянется новая сборка), и только потом отдаём ошибку в PageErrorBoundary.
 */
export const lazyWithRetry = <T extends ComponentType<any>>(load: () => Promise<{ default: T }>, retries = 2) =>
  lazy(async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await load();
      } catch (error) {
        if (!isChunkError(error)) throw error;
        if (attempt < retries) {
          await wait(500 * (attempt + 1));
          continue;
        }
        if (!reloadedRecently()) {
          try {
            sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          } catch {
            // хранилище недоступно — просто перезагрузимся
          }
          window.location.reload();
          return new Promise<never>(() => undefined);
        }
        throw error;
      }
    }
  });
