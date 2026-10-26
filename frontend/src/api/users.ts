import { UserAdmin, UserCreateData, UserPublic, UserUpdateData } from '../types';
import { apiClient } from './client';

export const usersApi = {
  /** Только для администратора: контакты без логинов */
  getAll: (): Promise<UserAdmin[]> => apiClient.get<UserAdmin[]>('/api/users/').then((res) => res.data),
  /** Для всех: имена и должности (график смен) */
  getAllPublic: (): Promise<UserPublic[]> => apiClient.get<UserPublic[]>('/api/users/public').then((res) => res.data),
  create: (user: UserCreateData): Promise<UserAdmin> => apiClient.post<UserAdmin>('/api/users/', user).then((res) => res.data),
  update: (id: number, user: UserUpdateData): Promise<UserAdmin> =>
    apiClient.put<UserAdmin>(`/api/users/${id}`, user).then((res) => res.data),
  resetPassword: (id: number): Promise<string> =>
    apiClient.post<{ temporary_password: string }>(`/api/users/${id}/reset-password`).then((res) => res.data.temporary_password),
  delete: (id: number): Promise<void> => apiClient.delete(`/api/users/${id}`).then(() => undefined),
};
