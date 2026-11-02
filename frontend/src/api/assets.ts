import { Asset, AssetEntry, AssetFilters, CreateAsset, CreateAssetEntry, UpdateAsset } from '../types';
import { apiClient } from './client';

const cleanParams = (filters: AssetFilters) =>
  Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''));

export const assetsApi = {
  getAll: (filters: AssetFilters = {}): Promise<Asset[]> =>
    apiClient.get<Asset[]>('/api/assets/', { params: cleanParams(filters) }).then((res) => res.data),
  create: (asset: CreateAsset): Promise<Asset> => apiClient.post<Asset>('/api/assets/', asset).then((res) => res.data),
  update: (id: number, asset: UpdateAsset): Promise<Asset> =>
    apiClient.put<Asset>(`/api/assets/${id}`, asset).then((res) => res.data),
  delete: (id: number): Promise<void> => apiClient.delete(`/api/assets/${id}`).then(() => undefined),
  /** Удалить все кейсы с историей (только администратор) */
  clear: (): Promise<{ deleted_assets: number }> =>
    apiClient.delete<{ deleted_assets: number }>('/api/assets/clear').then((res) => res.data),
  getEntries: (id: number): Promise<AssetEntry[]> =>
    apiClient.get<AssetEntry[]>(`/api/assets/${id}/entries`).then((res) => res.data),
  addEntry: (id: number, entry: CreateAssetEntry): Promise<AssetEntry> =>
    apiClient.post<AssetEntry>(`/api/assets/${id}/entries`, entry).then((res) => res.data),
};
