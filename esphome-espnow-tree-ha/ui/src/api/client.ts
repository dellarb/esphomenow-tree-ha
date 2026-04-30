export interface TopologyNode {
  mac: string;
  label?: string;
  parent_mac?: string;
  online?: boolean;
  state?: number;
  hops?: number;
  offline_s?: number;
  uptime_s?: number;
  entity_count?: number;
  firmware_version?: string;
  project_version?: string;
  esphome_name?: string;
  project_name?: string;
  firmware_build_date?: string;
  chip_type?: number;
  rssi?: number;
}

export interface OtaJob {
  id: number;
  mac: string;
  status: string;
  firmware_path?: string | null;
  retained_until?: number | null;
  firmware_name?: string | null;
  firmware_size?: number | null;
  firmware_md5?: string | null;
  parsed_project_name?: string | null;
  parsed_version?: string | null;
  parsed_esphome_name?: string | null;
  parsed_build_date?: string | null;
  parsed_chip_type?: number | null;
  old_firmware_version?: string | null;
  old_project_name?: string | null;
  preflight_warnings?: string | null;
  percent?: number | null;
  bridge_state?: string | null;
  error_msg?: string | null;
  started_at?: number | null;
  completed_at?: number | null;
  created_at: number;
  updated_at?: number | null;
}

export interface UploadResponse {
  job: OtaJob;
  firmware: Record<string, unknown>;
  warnings: string[];
}

export interface AppConfig {
  bridge: Record<string, unknown>;
  active_bridge: Record<string, unknown> | null;
  firmware_retention_days: number;
  ha_api_available: boolean;
}

const API_PREFIX: string = (() => {
  const el = document.querySelector('meta[name="x-ingress-path"]');
  if (el && el.getAttribute('content')) {
    return el.getAttribute('content')!.replace(/\/+$/, '');
  }
  return '';
})();

function apiPath(path: string): string {
  const prefix = API_PREFIX || '';
  if (path.startsWith('/')) {
    return prefix + path;
  }
  return prefix + '/' + path;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiPath(path), {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...(init?.headers || {}) }
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      message = body.detail || body.error || message;
    } catch {
      const text = await response.text();
      if (text) message = text;
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  config: () => request<AppConfig>('/api/config'),
  setBridge: (bridge_host: string, bridge_port: number) =>
    request<{ bridge: Record<string, unknown> }>('/api/config/bridge', {
      method: 'PUT',
      body: JSON.stringify({ bridge_host, bridge_port })
    }),
  clearBridge: () => request<{ bridge: Record<string, unknown> }>('/api/config/bridge', { method: 'DELETE' }),
  topology: () => request<TopologyNode[]>('/api/bridge/topology.json'),
  devices: () => request<Record<string, unknown>[]>('/api/devices'),
  device: (mac: string) => request<Record<string, unknown>>(`/api/devices/${encodeURIComponent(mac)}`),
  currentOta: () => request<{ job: OtaJob | null }>('/api/ota/current'),
  uploadFirmware: (mac: string, file: File) => {
    const body = new FormData();
    body.set('mac', mac);
    body.set('file', file);
    return request<UploadResponse>('/api/ota/upload', { method: 'POST', body });
  },
  startOta: (jobId: number) => request<{ job: OtaJob }>(`/api/ota/start/${jobId}`, { method: 'POST' }),
  abortOta: () => request<{ job: OtaJob | null }>('/api/ota/abort', { method: 'POST' }),
  history: (mac: string) => request<{ jobs: OtaJob[] }>(`/api/ota/history/${encodeURIComponent(mac)}`),
  retained: () => request<{ jobs: OtaJob[] }>('/api/firmware/retained'),
  reflash: (jobId: number) => request<{ job: OtaJob }>(`/api/ota/reflash/${jobId}`, { method: 'POST' }),
  deleteRetained: (jobId: number) => request<{ job: OtaJob }>(`/api/firmware/retained/${jobId}`, { method: 'DELETE' })
};

export function normalizeMac(value: string): string {
  const compact = value.replace(/[^0-9A-Fa-f]/g, '');
  if (compact.length !== 12) return value.trim().toUpperCase();
  return compact.match(/.{2}/g)!.join(':').toUpperCase();
}

export function fmtBytes(value?: number | null): string {
  const bytes = value || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function fmtTime(ts?: number | null): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString();
}

export function fmtDuration(seconds?: number | null): string {
  const value = Number(seconds || 0);
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m ${value % 60}s`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function chipName(chip?: number | null): string {
  const chips: Record<number, string> = {
    0: 'ESP32',
    2: 'ESP32-S2',
    5: 'ESP32-C3',
    9: 'ESP32-S3',
    12: 'ESP32-C2',
    13: 'ESP32-C6',
    16: 'ESP32-H2',
    18: 'ESP32-P4',
    20: 'ESP32-C61',
    23: 'ESP32-C5',
    25: 'ESP32-H21',
    28: 'ESP32-H4',
    31: 'ESP32-S3/FH'
  };
  return chip == null ? '-' : chips[chip] || `0x${chip.toString(16)}`;
}

export function jobIsActive(job?: OtaJob | null): boolean {
  return !!job && ['pending_confirm', 'starting', 'transferring', 'verifying', 'transfer_success_waiting_rejoin'].includes(job.status);
}
