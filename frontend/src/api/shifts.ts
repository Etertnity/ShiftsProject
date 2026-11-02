import { CreateShift, ScheduleGenerateParams, ScheduleGenerateResult, Shift, ShiftPartInput, ShiftStats, Timesheet } from '../types';
import { apiClient } from './client';

export interface ShiftQuery {
  date?: string;
  date_from?: string;
  date_to?: string;
}

export const shiftsApi = {
  getAll: (params: ShiftQuery = {}): Promise<Shift[]> =>
    apiClient.get<Shift[]>('/api/shifts/', { params }).then((res) => res.data),
  create: (shift: CreateShift): Promise<Shift> => apiClient.post<Shift>('/api/shifts/', shift).then((res) => res.data),
  createMultiple: (shifts: CreateShift[]): Promise<Shift[]> =>
    apiClient.post<Shift[]>('/api/shifts/bulk', { shifts }).then((res) => res.data),
  update: (id: number, shift: CreateShift): Promise<Shift> =>
    apiClient.put<Shift>(`/api/shifts/${id}`, shift).then((res) => res.data),
  delete: (id: number): Promise<void> => apiClient.delete(`/api/shifts/${id}`).then(() => undefined),
  /** Замена дежурного на всю смену */
  assign: (id: number, userId: number): Promise<Shift> =>
    apiClient.post<Shift>(`/api/shifts/${id}/assign`, { user_id: userId }).then((res) => res.data),
  /** Рокировка: две смены меняются сотрудниками */
  swap: (firstId: number, secondId: number): Promise<Shift[]> =>
    apiClient.post<Shift[]>('/api/shifts/swap', { shift_ids: [firstId, secondId] }).then((res) => res.data),
  /** Разделить смену по времени; пустой список — снова целиком одним сотрудником */
  split: (id: number, parts: ShiftPartInput[]): Promise<Shift> =>
    apiClient.put<Shift>(`/api/shifts/${id}/split`, { parts }).then((res) => res.data),
  generate: (params: ScheduleGenerateParams): Promise<ScheduleGenerateResult> =>
    apiClient.post<ScheduleGenerateResult>('/api/shifts/generate', params).then((res) => res.data),
  stats: (dateFrom: string, dateTo: string): Promise<ShiftStats> =>
    apiClient.get<ShiftStats>('/api/shifts/stats', { params: { date_from: dateFrom, date_to: dateTo } }).then((res) => res.data),
  /** Табель месяца (YYYY-MM): «отработано» и «станд.график» по каждому сотруднику */
  timesheet: (month: string): Promise<Timesheet> =>
    apiClient.get<Timesheet>('/api/shifts/timesheet', { params: { month } }).then((res) => res.data),
};
