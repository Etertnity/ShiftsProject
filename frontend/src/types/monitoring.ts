export interface MonitorConfig {
  configured: boolean;
  web_url?: string | null;
  warn_threshold: number;
  crit_threshold: number;
  stale_minutes: number;
}

export interface Vessel {
  id: number;
  item_id: string;
  name: string;
  is_hidden: boolean;
  position: number;
}

/** [unix-время в секундах, потери %] */
export type LossPoint = [number, number];

export type VesselState = 'loading' | 'error' | 'nodata' | 'ok' | 'warn' | 'crit';
