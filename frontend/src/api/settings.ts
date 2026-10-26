import { Catalog, Category, CategoryInput, StatusInput, StatusOption } from '../types';
import { apiClient } from './client';

export const settingsApi = {
  getCatalog: (): Promise<Catalog> => apiClient.get<Catalog>('/api/settings/catalog').then((res) => res.data),
  createCategory: (data: CategoryInput): Promise<Category> =>
    apiClient.post<Category>('/api/settings/categories', data).then((res) => res.data),
  updateCategory: (id: number, data: CategoryInput): Promise<Category> =>
    apiClient.put<Category>(`/api/settings/categories/${id}`, data).then((res) => res.data),
  deleteCategory: (id: number): Promise<void> => apiClient.delete(`/api/settings/categories/${id}`).then(() => undefined),
  reorderCategories: (ids: number[]): Promise<void> =>
    apiClient.put('/api/settings/categories/order', { ids }).then(() => undefined),
  saveStatuses: (statuses: StatusInput[]): Promise<StatusOption[]> =>
    apiClient.put<StatusOption[]>('/api/settings/statuses', { statuses }).then((res) => res.data),
};
