/** Куда идёт колонка Excel: date | person | notes | id | skip | category:<KEY> */
export type ColumnTarget = string;

export interface ImportColumn {
  index: number;
  letter: string;
  header: string;
  target: ColumnTarget;
}

export interface ImportRow {
  row: number;
  start: string | null;
  end: string | null;
  person: string;
  items: Record<string, number>;
  sample: string;
  has_notes: boolean;
  duplicate: boolean;
  error: string | null;
}

export interface ImportPreview {
  sheet: string;
  columns: ImportColumn[];
  mapping_error: string | null;
  rows: ImportRow[];
}

export interface ImportResult {
  handovers: number;
  duplicates: number;
  errors: string[];
  assets_created: number;
  assets_updated: number;
  entries: number;
  /** Статусы, выставленные по последней передаче файла */
  assets_closed: number;
  assets_reopened: number;
  last_handover: string | null;
}
