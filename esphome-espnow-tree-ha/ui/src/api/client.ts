export interface TopologyNode {
  mac: string;
  label?: string;
  parent_mac?: string;
  online?: boolean;
  hops?: number;
  offline_s?: number;
  offline_reason?: string;
  uptime_s?: number;
  last_seen_ms?: number;
  firmware_version?: string;
  project_version?: string;
  esphome_name?: string;
  friendly_name?: string;
  project_name?: string;
  firmware_build_date?: string;
  firmware_md5?: string;
  chip_name?: string;
  rssi?: number;
  route_v2_capable?: boolean;
  can_relay?: boolean;
  relay_enabled?: boolean;
  direct_child_count?: number;
  total_child_count?: number;
  is_bridge?: boolean;
  network_id?: string;
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
  current_increment?: number | null;
  total_increments?: number | null;
  retransmit_round?: number | null;
  buffer_size_kb?: number | null;
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

export interface ReflashResponse {
  job: OtaJob;
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

export interface LogEvent {
  type: string;
  ts: number;
  [key: string]: unknown;
}

export interface JobLogResponse {
  job_id: number;
  status: string;
  mac: string;
  is_terminal: boolean;
  log_events: LogEvent[];
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

export interface ConfigResult {
  result: 'ok' | 'busy' | 'rejected' | 'unsupported' | 'invalid_payload' | 'timeout' | 'no_session' | 'not_remote';
  command: string;
}

export interface ContainerStatusInfo {
  image: string;
  available: boolean;
  tag: string;
  error?: string;
}

export interface DiscoveredBridge {
  host: string;
  port: number;
  name: string;
  version: string;
  network_id?: string;
}

export interface ConfiguredBridge {
  id: number;
  name: string;
  host: string;
  port: number;
  discovered_via: string;
  api_key?: string;
  network_id?: string;
  last_connected_at?: number;
  created_at?: number;
}

export interface AppConfig {
  bridge: Record<string, unknown>;
  active_bridge: Record<string, unknown> | null;
  firmware_retention_days: number;
}

const API_PREFIX: string = (() => {
  const el = document.querySelector('meta[name="x-ingress-path"]');
  if (el && el.getAttribute('content')) {
    return el.getAttribute('content')!.replace(/\/+$/, '');
  }
  return '';
})();

const CONNECTION_TIMEOUT_MS = 15000;

export type ConnectionState = 'connected' | 'disconnected';

let _connectionState: ConnectionState = 'connected';

export function getConnectionState(): ConnectionState {
  return _connectionState;
}

export async function getBridgeState(): Promise<ConnectionState> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);
    const response = await fetch(apiPath('/api/health'), { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return 'disconnected';
    const body = parseBody(await response.text(), response.headers.get('content-type')) as { ws_connected?: boolean };
    return body.ws_connected === false ? 'disconnected' : 'connected';
  } catch {
    return 'disconnected';
  }
}

function setConnectionState(state: ConnectionState): void {
  _connectionState = state;
}

const TOPOLOGY_CACHE_TTL_MS = 30_000;
let _topologyCache: { data: TopologyNode[]; ts: number } | null = null;
let _serverId: string | null = null;

export interface WsTopologyMessage {
  type: string;
  payload: Record<string, unknown>;
}

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);
  try {
    const response = await fetch(apiPath(path), {
      ...init,
      signal: controller.signal,
      headers: init?.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...(init?.headers || {}) }
    });
    clearTimeout(timeout);
    setConnectionState('connected');
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
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      setConnectionState('disconnected');
    }
    throw err;
  }
}

export const api = {
  config: () => request<AppConfig>('/api/config'),
  setBridge: (bridge_host: string, bridge_port: number) =>
    request<{ bridge: Record<string, unknown> }>('/api/config/bridge', {
      method: 'PUT',
      body: JSON.stringify({ bridge_host, bridge_port })
    }),
  clearBridge: () => request<{ bridge: Record<string, unknown> }>('/api/config/bridge', { method: 'DELETE' }),
  discoverBridges: () => request<DiscoveredBridge[]>('/api/bridge/discover'),
  getBridges: () => request<ConfiguredBridge[]>('/api/bridges'),
  addBridge: (host: string, port: number, name?: string, api_key?: string) =>
    request<ConfiguredBridge>('/api/bridges', {
      method: 'POST',
      body: JSON.stringify({ host, port, name, api_key })
    }),
  updateBridge: (id: number, name?: string, host?: string, port?: number, api_key?: string) =>
    request<ConfiguredBridge>(`/api/bridges/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, host, port, api_key })
    }),
  deleteBridge: (id: number) =>
    request<{ deleted: boolean }>(`/api/bridges/${id}`, { method: 'DELETE' }),
  setDefaultBridge: (id: number) =>
    request<ConfiguredBridge>(`/api/bridges/${id}/set-default`, { method: 'POST' }),
  selectBridge: (host: string, port: number, name?: string, version?: string, api_key?: string, network_id?: string) =>
    request<ConfiguredBridge>('/api/bridge/select', {
      method: 'POST',
      body: JSON.stringify({ host, port, name, version, api_key, network_id })
    }),
  topology: (bypassCache = false) => {
    const now = Date.now();
    if (!bypassCache && _topologyCache && now - _topologyCache.ts < TOPOLOGY_CACHE_TTL_MS) {
      return Promise.resolve(_topologyCache.data);
    }
    return request<TopologyNode[]>('/api/bridge/topology.json').then(data => {
      _topologyCache = { data, ts: now };
      return data;
    });
  },
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
  jobLog: (jobId: number) => request<JobLogResponse>(`/api/ota/jobs/${jobId}/log`),
  retained: () => request<{ jobs: OtaJob[] }>('/api/firmware/retained'),
  reflash: (jobId: number) => request<ReflashResponse>(`/api/ota/reflash/${jobId}`, { method: 'POST' }),
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

  rebootDevice: (mac: string) => request<ConfigResult>(`/api/devices/${encodeURIComponent(mac)}/reboot`, { method: 'POST' }),
  setHeartbeatInterval: (mac: string, intervalSeconds: number) =>
    request<ConfigResult>(`/api/devices/${encodeURIComponent(mac)}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({ interval_seconds: intervalSeconds })
    }),
  forceRediscover: (mac: string) => request<ConfigResult>(`/api/devices/${encodeURIComponent(mac)}/rediscover`, { method: 'POST' }),
  setParentMac: (mac: string, parentMac: string, clear = true) =>
    request<ConfigResult>(`/api/devices/${encodeURIComponent(mac)}/parent`, {
      method: 'POST',
      body: JSON.stringify({ parent_mac: parentMac, clear })
    }),
  setRelay: (mac: string, enable: boolean) =>
    request<ConfigResult>(`/api/devices/${encodeURIComponent(mac)}/relay`, {
      method: 'POST',
      body: JSON.stringify({ enable })
    }),

  getCompileQueue: () => request<CompileQueueResponse>('/api/compile/queue'),
  abortCompileJob: (jobId: number) => request<{ ok: boolean; job_id: number }>(`/api/compile/queue/${jobId}/abort`, { method: 'POST' }),

  getSecrets: () => request<{ content: string }>('/api/secrets'),
  saveSecrets: (content: string) => request<{ content: string; saved: boolean }>('/api/secrets', {
    method: 'PUT',
    body: JSON.stringify({ content })
  }),

  getContainerStatus: () => request<ContainerStatusInfo>('/api/compile/container/status'),
  cleanArtifacts: () => request<{ ok: boolean; platformio_cache_bytes: number; esphome_build_bytes: number; total_bytes: number }>('/api/compile/artifacts', { method: 'DELETE' }),

  streamCompileLogs(mac: string, onLog: (line: string) => void, onError: (err: Event) => void): EventSource {
    const url = apiPath(`/api/devices/${encodeURIComponent(mac)}/compile/logs`);
    const es = new EventSource(url);
    es.onmessage = (event: MessageEvent) => {
      onLog(event.data as string);
    };
    es.addEventListener('status', (event: MessageEvent) => {
      onLog(`[status: ${event.data}]`);
    });
    es.addEventListener('exit', (event: MessageEvent) => {
      onLog(`[build exited with code ${event.data}]`);
    });
    es.addEventListener('queue_position', (event: MessageEvent) => {
      onLog(`[queue position: ${event.data}]`);
    });
    es.onerror = onError;
    return es;
  },

  downloadFactoryBinary(mac: string): string {
    return apiPath(`/api/devices/${encodeURIComponent(mac)}/firmware/download`);
  },
};

export function invalidateTopologyCache(): void {
  _topologyCache = null;
}

export interface TopologyStreamHandle {
  close: () => void;
}

export interface BridgeConnectionMessage {
  type: 'bridge.connection';
  payload: { connected: boolean };
}

export function streamBridgeState(handler: (connected: boolean) => void): TopologyStreamHandle {
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectDelay = 1000;

  const connect = () => {
    if (closed) return;
    const url = apiPath('/ws/topology');
    ws = new WebSocket(url);
    ws.onopen = () => {
      reconnectDelay = 1000;
    };
    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as WsTopologyMessage;
        if (msg.type === 'bridge.connection' && typeof msg.payload === 'object' && msg.payload !== null) {
          handler((msg.payload as { connected: boolean }).connected);
        }
      } catch {
      }
    };
    ws.onclose = () => {
      if (!closed) {
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      }
    };
    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return {
    close() {
      closed = true;
      ws?.close();
    },
  };
}

export function streamTopology(handler: (msg: WsTopologyMessage) => void): TopologyStreamHandle {
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectDelay = 1000;

  const connect = () => {
    if (closed) return;
    const url = apiPath('/ws/topology');
    ws = new WebSocket(url);
    ws.onopen = () => {
      reconnectDelay = 1000;
    };
    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg && msg.type === 'server_id' && typeof msg.value === 'string') {
          if (_serverId !== null && _serverId !== msg.value) {
            location.reload();
          }
          _serverId = msg.value;
        }
        handler(msg as WsTopologyMessage);
      } catch {
      }
    };
    ws.onclose = () => {
      if (!closed) {
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      }
    };
    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return {
    close() {
      closed = true;
      ws?.close();
    },
  };
}

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

export function fmtTimeAgo(ts?: number | null): string {
  if (!ts) return '-';
  const diffS = Math.max(0, Math.floor((Date.now() - ts * 1000) / 1000));
  if (diffS < 60) return `${diffS}s ago`;
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return `${Math.floor(diffS / 86400)}d ago`;
}

export function fmtDuration(seconds?: number | null): string {
  if (seconds == null || seconds <= 0) return '';
  const value = Number(seconds);
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m ${value % 60}s`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function jobIsActive(job?: OtaJob | null): boolean {
  return !!job && ['pending_confirm', 'compile_queued', 'compiling', 'queued', 'starting', 'transferring', 'verifying', 'transfer_success_waiting_rejoin'].includes(job.status);
}
