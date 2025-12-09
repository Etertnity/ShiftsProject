export interface User {
  id: number;
  username: string;
  name: string;
  position: string;
  phone?: string;
  telegram_id?: string;
  email?: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface Shift {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  shift_type: string;
  user_id: number;
  user_name: string;
  position: string;
  status: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: number;
  title: string;
  description: string;
  asset_type: 'CASE' | 'CHANGE_MANAGEMENT' | 'ORANGE_CASE' | 'CLIENT_REQUESTS';
  status: 'Active' | 'Completed' | 'On Hold' | 'Closed';
  created_at: string;
  updated_at: string;
}

export interface CreateAsset {
  title: string;
  description: string;
  asset_type: 'CASE' | 'CHANGE_MANAGEMENT' | 'ORANGE_CASE' | 'CLIENT_REQUESTS';
  status: 'Active' | 'Completed' | 'On Hold' | 'Closed';
}

export interface UpdateAsset {
  title?: string;
  description?: string;
  asset_type?: 'CASE' | 'CHANGE_MANAGEMENT' | 'ORANGE_CASE' | 'CLIENT_REQUESTS';
  status?: 'Active' | 'Completed' | 'On Hold' | 'Closed';
}

export interface Handover {
  id: number;
  from_shift_id?: number;
  to_shift_id?: number;
  handover_notes: string;
  assets: Asset[];
  created_at: string;
}

export interface CreateUser {
  username: string;
  password: string;
  name: string;
  position: string;
  phone?: string;
  telegram_id?: string;
  email?: string;
  is_admin?: boolean;
}

export interface UpdateProfile {
  name: string;
  position: string;
  phone?: string;
  telegram_id?: string;
  email?: string;
}

export interface LoginUser {
  username: string;
  password: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}

export interface CreateShift {
  date: string;
  start_time: string;
  end_time: string;
  shift_type: string;
  user_id: number;
  notes?: string;
}

export interface CreateHandover {
  from_shift_id?: number;
  to_shift_id?: number;
  handover_notes: string;
  asset_ids: number[];
}
