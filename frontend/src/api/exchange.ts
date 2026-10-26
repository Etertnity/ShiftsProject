import { ImportPreview, ImportResult } from '../types';
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

export const exchangeApi = {
  /** Скачивает выгрузку: передачи в формате журнала, кейсы и их история за период. */
  exportXlsx: async (dateFrom?: string, dateTo?: string): Promise<void> => {
    const response = await apiClient.get<Blob>('/api/exchange/export.xlsx', {
      params: { date_from: dateFrom || undefined, date_to: dateTo || undefined },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([response.data], { type: XLSX }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName(response.headers['content-disposition'], 'shift-handovers.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  preview: (file: File, mapping?: Record<number, string>): Promise<ImportPreview> =>
    apiClient.post<ImportPreview>('/api/exchange/import/preview', formData(file, mapping), multipart).then((res) => res.data),
  import: (file: File, mapping?: Record<number, string>): Promise<ImportResult> =>
    apiClient.post<ImportResult>('/api/exchange/import', formData(file, mapping), multipart).then((res) => res.data),
};
