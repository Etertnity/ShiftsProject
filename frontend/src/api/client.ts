import axios from 'axios';
import { tokenStorage } from '../utils/tokenStorage';

export const UNAUTHORIZED_EVENT = 'auth:unauthorized';

// Запросы идут на тот же origin: в dev их проксирует CRA (package.json → proxy), в проде — nginx
export const apiClient = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/api/token');
    if (error.response?.status === 401 && !isLoginRequest) {
      // Раньше тут был window.location.reload() — теперь просто сообщаем AuthContext о выходе
      tokenStorage.clear();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  },
);
