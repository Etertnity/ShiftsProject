import { AuthToken, LoginCredentials, PasswordChangeData, UpdateProfile, User } from '../types';
import { apiClient } from './client';

export const authApi = {
  login: (credentials: LoginCredentials): Promise<AuthToken> =>
    apiClient
      .post<AuthToken>('/api/token', new URLSearchParams({ ...credentials }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      .then((res) => res.data),
  me: (): Promise<User> => apiClient.get<User>('/api/me').then((res) => res.data),
  updateProfile: (profile: UpdateProfile): Promise<User> =>
    apiClient.put<User>('/api/profile', profile).then((res) => res.data),
  /** Сервер закрывает все прежние сессии и возвращает новый токен для этой */
  changePassword: (data: PasswordChangeData): Promise<AuthToken> =>
    apiClient.post<AuthToken>('/api/profile/password', data).then((res) => res.data),
};
