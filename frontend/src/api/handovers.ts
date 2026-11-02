import { CreateHandover, Handover, HandoverExport } from '../types';
import { apiClient } from './client';

export interface HandoverPage {
  items: Handover[];
  /** Всего передач в журнале */
  total: number;
}

export const handoversApi = {
  /** Журнал постранично (новые сверху): за год набегают сотни передач по десятку кейсов в каждой */
  list: (limit = 10, offset = 0): Promise<HandoverPage> =>
    apiClient
      .get<Handover[]>('/api/handovers/', { params: { limit, offset } })
      .then((res) => ({ items: res.data, total: Number(res.headers['x-total-count'] ?? res.data.length) })),
  create: (handover: CreateHandover): Promise<Handover> =>
    apiClient.post<Handover>('/api/handovers/', handover).then((res) => res.data),
  update: (id: number, handover: CreateHandover): Promise<Handover> =>
    apiClient.put<Handover>(`/api/handovers/${id}`, handover).then((res) => res.data),
  delete: (id: number): Promise<void> => apiClient.delete(`/api/handovers/${id}`).then(() => undefined),
  /** Удалить все передачи (только администратор) */
  clear: (): Promise<{ deleted_handovers: number }> =>
    apiClient.delete<{ deleted_handovers: number }>('/api/handovers/clear').then((res) => res.data),
  export: (): Promise<HandoverExport> =>
    apiClient.get<HandoverExport>('/api/handovers/export').then((res) => res.data),
};
