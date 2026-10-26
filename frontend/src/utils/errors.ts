import axios from 'axios';

/** Человекочитаемое сообщение об ошибке запроса. */
export const getErrorMessage = (error: unknown, fallback = 'Что-то пошло не так'): string => {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Нет связи с сервером. Проверьте подключение.';
    const detail = (error.response.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === 'string') return detail;
    // Ошибки валидации FastAPI приходят массивом
    if (Array.isArray(detail) && detail.length > 0) return 'Проверьте правильность заполнения полей';
    if (error.response.status >= 500) return 'Ошибка сервера. Попробуйте ещё раз позже.';
  }
  return fallback;
};
