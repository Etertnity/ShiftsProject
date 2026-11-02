/** Значения дополнительных полей категории: ключ поля → значение. */
export type CustomFieldValues = Record<string, string | number | boolean>;

export type AssetEntryKind = 'created' | 'comment' | 'status' | 'edit';

export interface AssetEntry {
  id: number;
  asset_id: number;
  kind: AssetEntryKind | string;
  text?: string | null;
  old_status?: string | null;
  new_status?: string | null;
  author_id?: number | null;
  author_name?: string | null;
  shift_id?: number | null;
  handover_id?: number | null;
  created_at: string;
}

export interface Asset {
  id: number;
  title: string;
  description: string;
  /** Ключ категории */
  asset_type: string;
  /** Ключ статуса */
  status: string;
  custom_fields: CustomFieldValues;
  created_at: string;
  updated_at: string;
  /** Есть в списке активов: последняя запись истории */
  last_entry?: AssetEntry | null;
}

export interface CreateAsset {
  title: string;
  description: string;
  asset_type: string;
  status?: string;
  custom_fields?: CustomFieldValues;
}

export interface UpdateAsset extends Partial<CreateAsset> {
  comment?: string;
  shift_id?: number | null;
}

export interface CreateAssetEntry {
  text?: string;
  status?: string;
  shift_id?: number | null;
}

export type AssetSort = 'updated_desc' | 'updated_asc' | 'created_desc' | 'created_asc' | 'title' | 'number_asc' | 'number_desc';

export interface AssetFilters {
  asset_type?: string;
  status?: string;
  /** Ищет и в названии/описании/полях, и в истории кейса */
  search?: string;
  /** Обновлялся в период (YYYY-MM-DD, по МСК, включительно) */
  updated_from?: string;
  updated_to?: string;
  /** В истории есть записи этого сотрудника */
  author_id?: number;
  sort?: AssetSort;
}
