export type ShiftType = 'day' | 'night';

/** Часть смены, отработанная конкретным сотрудником. Время местное (МСК): "2026-10-19T15:00". */
export interface ShiftSegment {
  user_id: number;
  user_name: string;
  start_at: string;
  end_at: string;
}

export interface Shift {
  id: number;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  shift_type: ShiftType | string;
  user_id: number;
  user_name: string;
  position: string;
  status?: string | null;
  notes?: string | null;
  /** Пусто — смену целиком отработал назначенный сотрудник */
  segments: ShiftSegment[];
  created_at: string;
  updated_at: string;
}

export interface CreateShift {
  date: string;
  start_time: string;
  end_time: string;
  shift_type: ShiftType;
  user_id: number;
  notes?: string;
}

export interface ShiftPartInput {
  user_id: number;
  start_at: string;
}

export type ShiftStatus = 'upcoming' | 'active' | 'finished';

/** Итог завершённой смены: целиком одним сотрудником или по частям. */
export type ShiftCoverage = 'full' | 'partial';

export interface ScheduleGenerateParams {
  date_from: string;
  date_to: string;
  user_ids: number[];
  mode: 'fill' | 'replace';
  preview: boolean;
}

export interface GeneratedShift {
  date: string;
  shift_type: ShiftType;
  start_time: string;
  end_time: string;
  user_id: number;
  user_name: string;
}

export interface ScheduleGenerateResult {
  shifts: GeneratedShift[];
  created: number;
  skipped: number;
  removed: number;
  warnings: string[];
}

export interface ShiftStatsItem {
  user_id: number;
  name: string;
  planned_shifts: number;
  planned_hours: number;
  worked_shifts: number;
  worked_hours: number;
  day_shifts: number;
  night_shifts: number;
  partial_shifts: number;
}

export interface ShiftStats {
  date_from: string;
  date_to: string;
  items: ShiftStatsItem[];
}
