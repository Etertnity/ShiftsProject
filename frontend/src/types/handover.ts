import { Asset, AssetEntry } from './asset';

export interface Handover {
  id: number;
  from_shift_id?: number | null;
  to_shift_id?: number | null;
  handover_notes: string;
  assets: Asset[];
  /** Записи истории активов, сделанные в этой передаче */
  entries: AssetEntry[];
  created_at: string;
}

export interface HandoverAssetUpdate {
  asset_id: number;
  status?: string;
  text?: string;
}

export interface CreateHandover {
  from_shift_id?: number | null;
  to_shift_id?: number | null;
  handover_notes: string;
  asset_ids: number[];
  updates: HandoverAssetUpdate[];
}

export interface HandoverLogItem {
  id: number;
  date: string;
  time: string;
  from_shift_user: string;
  from_shift_time: string;
  to_shift_user: string;
  to_shift_time: string;
  handover_notes: string;
  assets_info: string;
}

export interface HandoverExport {
  data: HandoverLogItem[];
  total: number;
  success: boolean;
}
