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
  chip_name?: string;
  rssi?: number;
  route_v2_capable?: boolean;
}

export interface OtaJob {
  id: number;
  mac: string;
  status: string;
  esphome_name?: string | null;
  firmware_path?: string | null;
  retained_until?: number | null;
  firmware_name?: string | null;
  firmware_size?: number | null;
  firmware_md5?: string | null;
  parsed_project_name?: string | null;
  parsed_version?: string | null;
  parsed_esphome_name?: string | null;
  parsed_build_date?: string | null;
  parsed_chip_name?: string | null;
  old_firmware_version?: string | null;
  old_project_name?: string | null;
  preflight_warnings?: string | null;
  percent?: number | null;
  bridge_state?: string | null;
  total_chunks?: number | null;
  chunks_sent?: number | null;
  error_msg?: string | null;
  started_at?: number | null;
  completed_at?: number | null;
  created_at: number;
  updated_at?: number | null;
  queue_order?: number | null;
  queue_position?: number | null;
  device_label?: string | null;
}

export interface StartResponse {
  job: OtaJob;
  queue_position?: number;
}

export interface QueueResponse {
  active_job: OtaJob | null;
  queued_jobs: OtaJob[];
  paused: boolean;
  count: number;
}

export interface PreflightComparison {
  name: { current: string; new: string; match: boolean };
  build_date: { current: string; new: string; status: string; delta: string };
  chip: { current: string; new: string; match: boolean };
  has_warnings: boolean;
  warnings: string[];
}

export interface UploadResponse {
  job: OtaJob;
  firmware: Record<string, unknown>;
  preflight: PreflightComparison;
}

export interface CompileResult {
  job: OtaJob;
  queue_position: number;
  preflight: PreflightComparison;
}

export interface CompileStatusResponse {
  mac: string;
  esphome_name: string;
  status: string;
  job_id: number | null;
  queue_position: number | null;
  compile_status: string | null;
  error: string | null;
}

export interface CompileQueueResponse {
  active_job: OtaJob | null;
  queued_jobs: OtaJob[];
  count: number;
}

export interface ConfigStatus {
  mac: string;
  esphome_name: string;
  config_state: 'no_config' | 'has_config' | 'compiled_ready' | 'compile_queued' | 'compiling';
  has_config: boolean;
  compile_status: string;
}

export interface DeviceConfig {
  mac: string;
  esphome_name: string;
  content: string;
  has_config: boolean;
}

export interface ContainerStatusInfo {
  image: string;
  available: boolean;
  tag: string;
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

function parseBody(text: string, contentType: string | null): unknown {
  if (!text) return null;
  if (contentType?.includes('application/json')) {
    return JSON.parse(text);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiPath(path), {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...(init?.headers || {}) }
  });
  const text = await response.text();
  const body = parseBody(text, response.headers.get('content-type'));
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    if (body && typeof body === 'object') {
      const errorBody = body as Record<string, unknown>;
      const detail = errorBody.detail;
      const error = errorBody.error;
      if (typeof detail === 'string' && detail) {
        message = detail;
      } else if (typeof error === 'string' && error) {
        message = error;
      }
    } else if (typeof body === 'string' && body) {
      message = body;
    }
    throw new Error(message);
  }
  return body as T;
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
  currentOtaForDevice: (mac: string) => request<{ job: OtaJob | null }>(`/api/ota/current?mac=${encodeURIComponent(mac)}`),
  uploadFirmware: (mac: string, file: File) => {
    const body = new FormData();
    body.set('mac', mac);
    body.set('file', file);
    return request<UploadResponse>('/api/ota/upload', { method: 'POST', body });
  },
  startOta: (jobId: number) => request<StartResponse>(`/api/ota/start/${jobId}`, { method: 'POST' }),
  abortOta: () => request<{ job: OtaJob | null }>('/api/ota/abort', { method: 'POST' }),
  getQueue: () => request<QueueResponse>('/api/ota/queue'),
  getQueuePaused: () => request<{ paused: boolean }>('/api/ota/queue/paused'),
  pauseQueue: () => request<{ paused: boolean }>('/api/ota/queue/pause', { method: 'POST' }),
  resumeQueue: () => request<{ paused: boolean }>('/api/ota/queue/resume', { method: 'POST' }),
  abortQueuedJob: (jobId: number) => request<{ ok: boolean }>(`/api/ota/queue/${jobId}/abort`, { method: 'POST' }),
  reorderJobUp: (jobId: number) => request<{ jobs: OtaJob[] }>(`/api/ota/queue/${jobId}/up`, { method: 'POST' }),
  reorderJobDown: (jobId: number) => request<{ jobs: OtaJob[] }>(`/api/ota/queue/${jobId}/down`, { method: 'POST' }),
  history: (mac: string) => request<{ jobs: OtaJob[] }>(`/api/ota/history/${encodeURIComponent(mac)}`),
  retained: () => request<{ jobs: OtaJob[] }>('/api/firmware/retained'),
  reflash: (jobId: number) => request<{ job: OtaJob }>(`/api/ota/reflash/${jobId}`, { method: 'POST' }),
  deleteRetained: (jobId: number) => request<{ job: OtaJob }>(`/api/firmware/retained/${jobId}`, { method: 'DELETE' }),

  // ── Config & Compile ──
  getConfig: (mac: string) => request<DeviceConfig>(`/api/devices/${encodeURIComponent(mac)}/config`),
  saveConfig: (mac: string, content: string, scaffold?: boolean) =>
    request<DeviceConfig>(`/api/devices/${encodeURIComponent(mac)}/config`, {
      method: 'PUT',
      body: JSON.stringify({ content, scaffold })
    }),
  deleteConfig: (mac: string) => request<{ deleted: boolean }>(`/api/devices/${encodeURIComponent(mac)}/config`, { method: 'DELETE' }),
  importConfig: (mac: string, fileOrContent: File | string) => {
    if (typeof fileOrContent === 'string') {
      return request<DeviceConfig>(`/api/devices/${encodeURIComponent(mac)}/config/import`, {
        method: 'POST',
        body: JSON.stringify({ content: fileOrContent })
      });
    }
    const body = new FormData();
    body.set('file', fileOrContent);
    return request<DeviceConfig>(`/api/devices/${encodeURIComponent(mac)}/config/import`, { method: 'POST', body });
  },
  getConfigStatus: (mac: string) => request<ConfigStatus>(`/api/devices/${encodeURIComponent(mac)}/config/status`),
  compileDevice: (mac: string) => request<CompileResult>(`/api/devices/${encodeURIComponent(mac)}/compile`, { method: 'POST' }),
  getCompileStatus: (mac: string) => request<CompileStatusResponse>(`/api/devices/${encodeURIComponent(mac)}/compile/status`),
  cancelCompile: (mac: string) => request<{ cancelled: boolean; job_id: number; mac: string }>(`/api/devices/${encodeURIComponent(mac)}/compile/cancel`, { method: 'POST' }),
  startCompileFlash: (mac: string) => request<{ job: OtaJob }>(`/api/devices/${encodeURIComponent(mac)}/compile/start-flash`, { method: 'POST' }),
  getCompileHistory: (mac: string) => request<{ jobs: OtaJob[] }>(`/api/devices/${encodeURIComponent(mac)}/compile/history`),

  getCompileQueue: () => request<CompileQueueResponse>('/api/compile/queue'),
  abortCompileJob: (jobId: number) => request<{ ok: boolean; job_id: number }>(`/api/compile/queue/${jobId}/abort`, { method: 'POST' }),

  getSecrets: () => request<{ content: string }>('/api/secrets'),
  saveSecrets: (content: string) => request<{ content: string; saved: boolean }>('/api/secrets', {
    method: 'PUT',
    body: JSON.stringify({ content })
  }),

  getContainerStatus: () => request<ContainerStatusInfo>('/api/compile/container/status'),
  deleteContainer: () => request<{ ok: boolean }>('/api/compile/container', { method: 'DELETE' }),
  cleanArtifacts: () => request<{ ok: boolean; platformio_cache_bytes: number; esphome_build_bytes: number; total_bytes: number }>('/api/compile/artifacts', { method: 'DELETE' }),

  streamCompileLogs(mac: string, onLog: (line: string) => void, onError: (err: Event) => void): EventSource {
    const url = apiPath(`/api/devices/${encodeURIComponent(mac)}/compile/logs`);
    const es = new EventSource(url);
    es.onmessage = (event: MessageEvent) => {
      onLog(event.data as string);
    };
    es.onerror = onError;
    return es;
  },

  downloadFactoryBinary(mac: string): string {
    return apiPath(`/api/devices/${encodeURIComponent(mac)}/firmware/download`);
  },
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

export function jobIsActive(job?: OtaJob | null): boolean {
  return !!job && ['pending_confirm', 'compile_queued', 'compiling', 'queued', 'starting', 'transferring', 'verifying', 'transfer_success_waiting_rejoin'].includes(job.status);
}
