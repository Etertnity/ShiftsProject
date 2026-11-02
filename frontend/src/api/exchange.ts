import { ImportPreview, ImportResult, ScheduleImportPreview, ScheduleImportResult } from '../types';
import { apiClient } from './client';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const formData = (file: File, mapping?: Record<number, string>) => {
  const data = new FormData();
  data.append('file', file);
  if (mapping) data.append('mapping', JSON.stringify(mapping));
  return data;
};

// Без явного multipart axios превратил бы FormData в JSON (у клиента по умолчанию application/json)
const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

/** Имя файла из Content-Disposition, иначе запасное. */
const fileName = (disposition: string | undefined, fallback: string) => {
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? fallback;
};

/** Скачивает xlsx с сервера под именем из Content-Disposition. */
const download = async (url: string, params: Record<string, string | undefined>, fallback: string) => {
  const response = await apiClient.get<Blob>(url, { params, responseType: 'blob' });
  const href = URL.createObjectURL(new Blob([response.data], { type: XLSX }));
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName(response.headers['content-disposition'], fallback);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
};

export const exchangeApi = {
  /** Скачивает выгрузку: передачи в формате журнала, кейсы и их история за период. */
  exportXlsx: (dateFrom?: string, dateTo?: string): Promise<void> =>
    download('/api/exchange/export.xlsx', { date_from: dateFrom || undefined, date_to: dateTo || undefined }, 'shift-handovers.xlsx'),
  /** График смен в формате файла «График сменных» за месяцы YYYY-MM */
  exportSchedule: (monthFrom: string, monthTo: string): Promise<void> =>
    download('/api/exchange/schedule.xlsx', { month_from: monthFrom, month_to: monthTo }, 'shift-schedule.xlsx'),
  schedulePreview: (file: File): Promise<ScheduleImportPreview> =>
    apiClient.post<ScheduleImportPreview>('/api/exchange/schedule/preview', formData(file), multipart).then((res) => res.data),
  scheduleImport: (file: File, months: string[], mode: 'update' | 'fill'): Promise<ScheduleImportResult> => {
    const data = formData(file);
    data.append('months', JSON.stringify(months));
    data.append('mode', mode);
    return apiClient.post<ScheduleImportResult>('/api/exchange/schedule/import', data, multipart).then((res) => res.data);
  },
  preview: (file: File, mapping?: Record<number, string>): Promise<ImportPreview> =>
    apiClient.post<ImportPreview>('/api/exchange/import/preview', formData(file, mapping), multipart).then((res) => res.data),
  import: (file: File, mapping?: Record<number, string>): Promise<ImportResult> =>
    apiClient.post<ImportResult>('/api/exchange/import', formData(file, mapping), multipart).then((res) => res.data),
};
