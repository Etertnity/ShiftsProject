import { LossPoint, MonitorConfig, Vessel } from '../types';
import { apiClient } from './client';

export const monitoringApi = {
  config: (): Promise<MonitorConfig> => apiClient.get<MonitorConfig>('/api/monitoring/config').then((res) => res.data),
  vessels: (): Promise<Vessel[]> => apiClient.get<Vessel[]>('/api/monitoring/vessels').then((res) => res.data),
  createVessel: (name: string, item: string): Promise<Vessel> =>
    apiClient.post<Vessel>('/api/monitoring/vessels', { name, item }).then((res) => res.data),
  updateVessel: (id: number, data: { name?: string; item?: string; is_hidden?: boolean }): Promise<Vessel> =>
    apiClient.put<Vessel>(`/api/monitoring/vessels/${id}`, data).then((res) => res.data),
  /** Полная история за период (часы) */
  history: (itemId: string, hours: number): Promise<LossPoint[]> =>
    apiClient.get<{ points: LossPoint[] }>(`/api/monitoring/history/${itemId}`, { params: { hours } }).then((res) => res.data.points),
  /** Только новые точки после указанного времени */
  historySince: (itemId: string, since: number): Promise<LossPoint[]> =>
    apiClient.get<{ points: LossPoint[] }>(`/api/monitoring/history/${itemId}`, { params: { since } }).then((res) => res.data.points),
};
