export type ColorKey =
  | 'slate' | 'sky' | 'blue' | 'indigo' | 'violet' | 'pink' | 'rose' | 'red'
  | 'orange' | 'amber' | 'emerald' | 'green' | 'teal' | 'cyan';

export type IconKey =
  | 'folder' | 'briefcase' | 'globe' | 'wrench' | 'message' | 'alert' | 'server' | 'shield'
  | 'phone' | 'bug' | 'zap' | 'clock' | 'mail' | 'users' | 'database' | 'file';

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'url';

export interface CategoryField {
  id: number;
  key: string;
  label: string;
  field_type: FieldType;
  options: string[];
  placeholder?: string | null;
  required: boolean;
  show_in_card: boolean;
  position: number;
}

export interface Category {
  id: number;
  key: string;
  name: string;
  description?: string | null;
  color: ColorKey;
  icon: IconKey;
  position: number;
  is_active: boolean;
  auto_include_in_handover: boolean;
  fields: CategoryField[];
  asset_count: number;
}

export interface StatusOption {
  id: number;
  key: string;
  name: string;
  color: ColorKey;
  is_closed: boolean;
  is_default: boolean;
  position: number;
  asset_count: number;
}

export interface Catalog {
  categories: Category[];
  statuses: StatusOption[];
}

export interface CategoryFieldInput {
  id?: number;
  label: string;
  field_type: FieldType;
  options: string[];
  placeholder?: string | null;
  required: boolean;
  show_in_card: boolean;
}

export interface CategoryInput {
  name: string;
  description?: string | null;
  color: ColorKey;
  icon: IconKey;
  is_active: boolean;
  auto_include_in_handover: boolean;
  fields: CategoryFieldInput[];
}

export interface StatusInput {
  id?: number;
  name: string;
  color: ColorKey;
  is_closed: boolean;
  is_default: boolean;
}
