import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import '../components/config-editor';
import '../components/compile-status';
import '../components/compile-log-viewer';
import { api, CompileStatusResponse, DeviceConfig, normalizeMac, PreflightComparison, SerialFlashStatus, SerialPortInfo } from '../api/client';

type PageState = 'loading' | 'no_config' | 'editor';
type CompilePhase = 'idle' | 'compile_queued' | 'compiling' | 'success' | 'failed' | 'queued_for_flash';

@customElement('esp-config-page')
export class EspConfigPage extends LitElement {
  @property({ type: String }) mac = '';
  @state() private state: PageState = 'loading';
  @state() private device: Record<string, unknown> | null = null;
  @state() private config: DeviceConfig | null = null;
  @state() private editorContent = '';
  @state() private saveIndicator = '';
  @state() private error = '';
  @state() private compilePhase: CompilePhase = 'idle';
  @state() private topology: { mac: string; online?: boolean }[] = [];
  @state() private compileJobId: number | null = null;
  @state() private compileQueuePosition: number | null = null;
  @state() private preflight: PreflightComparison | null = null;
  @state() private chipUnknown = false;
  @state() private acceptedWarnings = false;
  @state() private yamlWarnings: string[] = [];
  @state() private showCompileLog = true;
  @state() private serialPanelOpen = false;
  @state() private serialPorts: SerialPortInfo[] = [];
  @state() private selectedSerialPort = '';
  @state() private serialPortsLoading = false;
  @state() private serialStatus: SerialFlashStatus | null = null;
  @state() private serialError = '';
  @state() private serialLogs: string[] = [];
  @state() private compileStartedAt: number | null = null;
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
  @query('esp-compile-log-viewer') private compileLogViewer!: HTMLElement | null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private devicePollTimer: ReturnType<typeof setInterval> | null = null;
  private serialPollTimer: ReturnType<typeof setInterval> | null = null;
  private serialEventSource: EventSource | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  disconnectedCallback(): void {
    this.stopPolling();
    this.stopDevicePolling();
    this.stopSerialPolling();
    this.closeSerialLog();
    super.disconnectedCallback();
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.pollCompileStatus(), 2000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private stopCompileLogViewer(): void {
    if (this.compileLogViewer) {
      (this.compileLogViewer as any).stopped = true;
    }
  }

  private startDevicePolling(): void {
    if (this.devicePollTimer) return;
    this.devicePollTimer = setInterval(() => void this.pollDevice(), 30_000);
  }

  private stopDevicePolling(): void {
    if (this.devicePollTimer) {
      clearInterval(this.devicePollTimer);
      this.devicePollTimer = null;
    }
  }

  private async pollDevice(): Promise<void> {
    try {
      const dev = await api.device(this.mac);
      this.device = dev || {};
    } catch {
      // ignore poll errors
    }
  }

  private startSerialPolling(): void {
    if (this.serialPollTimer) return;
    this.serialPollTimer = setInterval(() => void this.pollSerialFlashStatus(), 1000);
  }

  private stopSerialPolling(): void {
    if (this.serialPollTimer) {
      clearInterval(this.serialPollTimer);
      this.serialPollTimer = null;
    }
  }

  private closeSerialLog(): void {
    if (this.serialEventSource) {
      this.serialEventSource.close();
      this.serialEventSource = null;
    }
  }

  private get isCompilingActive(): boolean {
    return this.compilePhase === 'compiling' || this.compilePhase === 'compile_queued';
  }

  private getElapsedTime(): string {
    if (!this.compileStartedAt) return '00:00';
    const elapsed = Math.floor((Date.now() - this.compileStartedAt) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  private startElapsedTimer(): void {
    this.stopElapsedTimer();
    this.elapsedTimer = setInterval(() => this.requestUpdate(), 1000);
  }

  private stopElapsedTimer(): void {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  private async load(): Promise<void> {
    this.state = 'loading';
    try {
      const [dev, configData, topology] = await Promise.all([
        api.device(this.mac).catch(() => null),
        api.getConfig(this.mac).catch(() => null),
        api.topology().catch(() => []),
      ]);
      this.device = dev || {};
      this.topology = topology;
      this.startDevicePolling();
      if (configData && (configData as DeviceConfig).has_config) {
        this.config = configData as DeviceConfig;
        this.editorContent = this.config.content;
        this.state = 'editor';
      } else {
        this.state = 'no_config';
      }
      await this.pollCompileStatus();
    } catch {
      this.state = 'no_config';
    }
  }

  private async pollCompileStatus(): Promise<void> {
    try {
      const status: CompileStatusResponse = await api.getCompileStatus(this.mac);
      if (status.status === 'compile_queued') {
        this.compilePhase = 'compile_queued';
        this.compileJobId = status.job_id;
        this.compileQueuePosition = status.queue_position;
        this.startPolling();
      } else if (status.status === 'compiling') {
        this.compilePhase = 'compiling';
        this.compileJobId = status.job_id;
        this.compileQueuePosition = null;
        this.startPolling();
      } else if (status.status === 'queued') {
        this.compilePhase = 'queued_for_flash';
        this.compileJobId = status.job_id;
        this.compileQueuePosition = status.queue_position;
        this.startPolling();
      } else if (['starting', 'transferring', 'verifying', 'transfer_success_waiting_rejoin'].includes(status.status)) {
        this.compilePhase = 'queued_for_flash';
        this.compileJobId = status.job_id;
        this.compileQueuePosition = null;
        this.startPolling();
      } else if (['success', 'aborted', 'rejoin_timeout', 'version_mismatch'].includes(status.status)) {
        this.compilePhase = 'idle';
        this.compileJobId = null;
        this.compileQueuePosition = null;
        this.compileStartedAt = null;
        this.stopElapsedTimer();
        this.stopPolling();
        this.stopCompileLogViewer();
      } else if (status.status === 'idle') {
        if (this.compilePhase === 'queued_for_flash') {
          this.compilePhase = 'idle';
          this.compileJobId = null;
          this.compileQueuePosition = null;
        } else if (this.compilePhase === 'compile_queued' || this.compilePhase === 'compiling') {
          this.compilePhase = 'idle';
          this.compileJobId = null;
          this.compileQueuePosition = null;
          this.compileStartedAt = null;
          this.stopElapsedTimer();
        }
        this.stopPolling();
        this.stopCompileLogViewer();
      } else if (status.status === 'failed') {
        this.compilePhase = 'failed';
        this.compileJobId = null;
        this.compileQueuePosition = null;
        this.compileStartedAt = null;
        this.stopElapsedTimer();
        this.stopPolling();
        this.stopCompileLogViewer();
      } else if (status.error) {
        this.compilePhase = 'failed';
        this.error = status.error;
        this.compileStartedAt = null;
        this.stopElapsedTimer();
        this.stopPolling();
        this.stopCompileLogViewer();
      }
    } catch {
      // ignore poll errors
    }
  }

  private async createScaffold(): Promise<void> {
    try {
      const result = await api.saveConfig(this.mac, '', true);
      this.config = result;
      this.editorContent = result.content;
      this.chipUnknown = result.chip_unknown ?? false;
      this.state = 'editor';
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private async importYaml(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yaml,.yml';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const result = await api.importConfig(this.mac, file);
        this.config = result;
        this.editorContent = result.content;
        this.state = 'editor';
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      }
    };
    input.click();
  }

  private async saveConfig(): Promise<void> {
    this.saveIndicator = 'Saving...';
    try {
      const result = await api.saveConfig(this.mac, this.editorContent);
      this.config = result;
      this.saveIndicator = 'Saved ✓';
      setTimeout(() => { this.saveIndicator = ''; this.requestUpdate(); }, 2000);
    } catch (err) {
      this.saveIndicator = '';
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private onEditorChange(e: CustomEvent): void {
    this.editorContent = (e.detail as { content: string; warnings?: string[] }).content;
    this.yamlWarnings = (e.detail as { content: string; warnings?: string[] }).warnings ?? [];
    this.saveIndicator = '';
  }

  private async triggerCompile(): Promise<void> {
    if (this.compilePhase === 'compiling' || this.compilePhase === 'compile_queued') return;
    this.compilePhase = 'compiling';
    this.compileStartedAt = Date.now();
    this.startElapsedTimer();
    this.error = '';
    this.showCompileLog = true;
    this.acceptedWarnings = false;

    try {
      const result = await api.compileDevice(this.mac);
      this.compileJobId = result.job.id;
      this.preflight = result.preflight || null;
      if (result.job.status === 'compile_queued') {
        this.compilePhase = 'compile_queued';
        this.compileQueuePosition = result.queue_position;
      } else if (result.job.status === 'compiling') {
        this.compilePhase = 'compiling';
        this.compileQueuePosition = null;
      }
      this.startPolling();
    } catch (err) {
      this.compilePhase = 'failed';
      this.compileStartedAt = null;
      this.stopElapsedTimer();
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private async cancelCompile(): Promise<void> {
    try {
      await api.cancelCompile(this.mac);
    } catch {
      // no active job to cancel — fall through to local reset
    }
    this.compilePhase = 'idle';
    this.compileJobId = null;
    this.compileQueuePosition = null;
    this.compileStartedAt = null;
    this.stopElapsedTimer();
    this.stopPolling();
  }

  private async flashNow(): Promise<void> {
    try {
      await api.startCompileFlash(this.mac);
      window.location.hash = `/device/${encodeURIComponent(this.mac)}`;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private downloadFactory(): void {
    window.open(api.downloadFactoryBinary(this.mac), '_blank');
  }

  private async openSerialPanel(force = false): Promise<void> {
    this.serialPanelOpen = true;
    this.serialError = '';
    if (!force && this.serialPorts.length > 0) return;
    this.serialPortsLoading = true;
    try {
      const response = await api.getSerialPorts();
      this.serialPorts = response.ports;
      const preferred = this.serialPorts.find((p) => p.available) || this.serialPorts[0];
      this.selectedSerialPort = preferred?.port || '';
      if (this.serialPorts.length === 0) {
        this.serialError = 'No serial ports are visible to the add-on.';
      }
    } catch (err) {
      this.serialError = err instanceof Error ? err.message : String(err);
    } finally {
      this.serialPortsLoading = false;
    }
  }

  private beginSerialLog(): void {
    this.closeSerialLog();
    this.serialEventSource = api.streamSerialFlashLogs(
      this.mac,
      (line) => {
        this.serialLogs = [...this.serialLogs, line];
      },
      (status) => {
        if (this.serialStatus) {
          this.serialStatus = { ...this.serialStatus, status: status as SerialFlashStatus['status'] };
        }
      },
      () => {
        this.closeSerialLog();
      },
    );
  }

  private async startSerialFlash(): Promise<void> {
    if (!this.selectedSerialPort) {
      this.serialError = 'Select a serial port first.';
      return;
    }
    this.serialError = '';
    this.serialLogs = [];
    this.serialStatus = {
      status: 'starting',
      esphome_name: String(this.device?.esphome_name || ''),
      port: this.selectedSerialPort,
      error: null,
    };
    try {
      await api.startSerialFlash(this.mac, this.selectedSerialPort);
      this.beginSerialLog();
      this.startSerialPolling();
      await this.pollSerialFlashStatus();
    } catch (err) {
      this.closeSerialLog();
      this.serialStatus = { ...this.serialStatus, status: 'failed', error: err instanceof Error ? err.message : String(err) };
      this.serialError = err instanceof Error ? err.message : String(err);
    }
  }

  private async pollSerialFlashStatus(): Promise<void> {
    try {
      const status = await api.getSerialFlashStatus(this.mac);
      this.serialStatus = status;
      if (status.status === 'success' || status.status === 'failed' || status.status === 'idle') {
        this.stopSerialPolling();
        this.closeSerialLog();
      }
      if (status.error) this.serialError = status.error;
    } catch {
      // keep the in-flight UI stable while the request is transiently unavailable
    }
  }

  private async cancelSerialFlash(): Promise<void> {
    try {
      await api.cancelSerialFlash(this.mac);
      await this.pollSerialFlashStatus();
    } catch (err) {
      this.serialError = err instanceof Error ? err.message : String(err);
    }
  }

  private goBack(): void {
    window.location.hash = `/device/${encodeURIComponent(this.mac)}`;
  }

  private goToSecrets(): void {
    window.location.hash = `/secrets?from=${encodeURIComponent(window.location.hash)}`;
  }

  render() {
    const esphomeName = String(this.device?.esphome_name || this.device?.label || this.mac);
    const chipName = String(this.device?.chip_name || '-');
    const topologyNode = this.topology.find((n) => normalizeMac(n.mac) === normalizeMac(this.mac));
    const online = topologyNode?.online ?? Boolean(this.device?.online);
    const dev = this.device as { is_bridge?: boolean; hops?: number };
    const isBridge = Boolean(dev?.is_bridge);
    const isRemote = !isBridge && (dev?.hops ?? 0) > 0;

    return html`
      <div class="config-page" data-job-id=${this.compileJobId ?? ''}>
        <header class="config-header">
          <button class="back" @click=${this.goBack}>&#8592; Back to device</button>
          <div class="header-info">
            <h2>${esphomeName}${isRemote ? html`<span class="device-type-tag">Remote</span>` : nothing}</h2>
            <p>${this.mac} &middot; ${chipName} &middot; <span class=${online ? 'ok' : 'danger'}>${online ? 'online' : 'offline'}</span></p>
          </div>
          <button class="btn btn-edit-config" @click=${this.goToSecrets}>Secrets &#9881;</button>
        </header>

        ${this.state === 'loading'
          ? html`<div class="card">Loading config...</div>`
          : this.state === 'no_config'
            ? html`
                <div class="card no-config">
                  ${this.chipUnknown ? html`
                    <div class="chip-error-banner">
                      <span>&#9888; Unsupported chip type detected. Ensure correct chip type is entered in topology settings before compiling.</span>
                      <button class="dismiss-btn" @click=${() => { this.chipUnknown = false; }}>&#10005;</button>
                    </div>
                  ` : nothing}
                  <h3>No configuration yet for this device.</h3>
                  <div class="no-config-actions">
                    <button class="btn btn-primary" @click=${this.createScaffold}>Create Config</button>
                    <button class="btn" @click=${this.importYaml}>Import YAML</button>
                  </div>
                  <p class="hint">Create Config generates a minimal scaffold populated from this device's topology data.</p>
                  <p class="hint">Import lets you upload an existing YAML file.</p>
                  ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
                </div>
              `
: this.state === 'editor'
                ? html`
                    ${!this.isCompilingActive
                      ? html`
                          <esp-config-editor
                            .value=${this.editorContent}
                            .readonly=${false}
                            @content-change=${this.onEditorChange}
                          ></esp-config-editor>

                          ${this.yamlWarnings.length > 0
                            ? html`<div class="yaml-warnings">${this.yamlWarnings.map((w) => html`<p>&#9888; ${w}</p>`)}</div>`
                            : nothing}
                        `
                      : html`
                          <div class="compile-focus-view">
                            <div class="compile-status-header">
                              <span class="compile-spinner">&#9696;</span>
                              <span>${this.compilePhase === 'compile_queued'
                                ? `Queued at position ${this.compileQueuePosition !== null ? this.compileQueuePosition : '?'}`
                                : 'Compiling firmware...'}</span>
                              <span class="compile-elapsed">${this.getElapsedTime()}</span>
                            </div>
                            <esp-compile-log-viewer
                              .mac=${this.mac}
                              .visible=${true}
                              class="expanded-log"
                            ></esp-compile-log-viewer>
                          </div>
                        `
                    }

                    <esp-compile-log-viewer
                      .mac=${this.mac}
                      .visible=${(this.compilePhase === 'queued_for_flash' || this.compilePhase === 'failed') && this.showCompileLog}
                      class="bottom-log"
                    ></esp-compile-log-viewer>

                    ${this.compilePhase === 'compile_queued'
                    ? html`
                        <div class="queue-banner">
                          <strong>&#9203; Position ${this.compileQueuePosition !== null ? this.compileQueuePosition : '?'} in compile queue</strong>
                          <small>Waiting for compile slot...</small>
                          <button class="cancel-btn" @click=${this.cancelCompile}>Cancel</button>
                        </div>
                      `
                    : nothing}

                  <div class="action-bar">
                    <button class="btn btn-primary" @click=${this.saveConfig} ?disabled=${this.compilePhase === 'compiling' || this.compilePhase === 'compile_queued'}>
                      ${this.saveIndicator || 'Save'}
                    </button>
                    ${this.compilePhase === 'idle' || this.compilePhase === 'failed'
                      ? html`<button class="btn btn-success" ?disabled=${!this.config} @click=${this.triggerCompile}>Compile & Install</button>`
                      : this.compilePhase === 'compiling' || this.compilePhase === 'compile_queued'
                        ? html`<button class="btn btn-danger" @click=${this.cancelCompile}>Cancel</button>`
                        : nothing
                    }
                  </div>

                  ${this.compilePhase === 'compiling'
                    ? html`<p class="status-line">Status: compiling... <button class="cancel-link" @click=${this.cancelCompile}>Cancel</button></p>`
                    : this.compilePhase === 'compile_queued'
                      ? html`<p class="status-line">Status: waiting to compile (#${this.compileQueuePosition !== null ? this.compileQueuePosition : '?'})</p>`
                      : html`<p class="status-line">Status: ${this.saveIndicator ? 'saved' : 'unsaved'}</p>`
                  }

                  ${this.error && this.compilePhase !== 'compiling'
                    ? html`<p class="error">${this.error}</p>`
                    : nothing}

                  ${this.compilePhase === 'queued_for_flash'
                    ? html`
                        <div class="success-section">
                          <div class="success-banner">&#10003; Build successful</div>
                          <p class="build-info">${esphomeName} &middot; ready for flash</p>
                          ${this.preflight ? this.renderPreflight() : nothing}
                          ${this.preflight?.has_warnings
                            ? html`
                                <div class="warnings">
                                  ${this.preflight!.warnings.map((w) => html`<p>${w}</p>`)}
                                  <label>
                                    <input type="checkbox" .checked=${this.acceptedWarnings} @change=${(event: Event) => (this.acceptedWarnings = (event.target as HTMLInputElement).checked)} />
                                    Flash anyway
                                  </label>
                                </div>
                              `
                            : nothing}
                          ${this.compileQueuePosition !== null && this.compileQueuePosition > 1
                            ? html`<p class="build-info">&#9203; Position ${this.compileQueuePosition} in flash queue</p>`
                            : nothing
                          }
                  <div class="flash-actions">
                    <button class="btn btn-primary" ?disabled=${this.preflight?.has_warnings && !this.acceptedWarnings} @click=${this.flashNow}>&#9654; Flash via ESP-NOW</button>
                    <button class="btn" @click=${this.downloadFactory}>&#8595; Download factory .bin</button>
                    <button class="btn" @click=${() => this.openSerialPanel()}>Flash via USB</button>
                  </div>
                          ${this.serialPanelOpen ? this.renderSerialFlashPanel() : nothing}
                          <p class="hint">You can also monitor progress on the device page.</p>
                        </div>
                      `
                    : nothing}

                  ${this.compilePhase === 'failed'
                    ? html`
                        <div class="fail-section">
                          <div class="fail-banner">
                            <span>&#10007; Build failed</span>
                            ${this.showCompileLog ? html`<button class="close-logs-link" @click=${() => { this.showCompileLog = false; }}>Hide logs</button>` : html`<button class="close-logs-link" @click=${() => { this.showCompileLog = true; }}>Show logs</button>`}
                          </div>
                          <p class="hint">Fix the YAML above and try again. <button class="btn-link" @click=${this.cancelCompile}>Cancel</button></p>
                        </div>
                      `
                    : nothing}
                `
              : nothing}
      </div>
    `;
  }

  private renderPreflight() {
    const p = this.preflight;
    if (!p) return nothing;
    return html`
      <table class="compare-table">
        <thead><tr><th>Field</th><th>Current</th><th>New</th></tr></thead>
        <tbody>
          <tr>
            <td>Name</td>
            <td>${p.name.current || '-'}</td>
            <td>${p.name.new || '-'} <span class="ver-badge ${p.name.match ? 'match' : 'mismatch'}">${p.name.match ? 'MATCH' : 'MISMATCH'}</span></td>
          </tr>
          <tr>
            <td>Chip</td>
            <td>${p.chip.current || '-'}</td>
            <td>${p.chip.new || '-'} <span class="ver-badge ${p.chip.match ? 'match' : 'mismatch'}">${p.chip.match ? 'MATCH' : 'MISMATCH'}</span></td>
          </tr>
        </tbody>
      </table>
    `;
  }

  private renderSerialFlashPanel() {
    const status = this.serialStatus?.status || 'idle';
    const isActive = status === 'starting' || status === 'flashing';
    return html`
      <div class="serial-panel">
        <div class="serial-controls">
          <label>
            Port
            <select
              .value=${this.selectedSerialPort}
              ?disabled=${isActive || this.serialPortsLoading}
              @change=${(event: Event) => (this.selectedSerialPort = (event.target as HTMLSelectElement).value)}
            >
              ${this.serialPorts.map((port) => html`
                <option value=${port.port}>${port.by_id ? port.label : port.port}${port.available ? '' : ' (permission?)'}</option>
              `)}
            </select>
          </label>
          <button class="btn" ?disabled=${this.serialPortsLoading || isActive} @click=${() => this.openSerialPanel(true)}>
            ${this.serialPortsLoading ? 'Scanning...' : 'Refresh ports'}
          </button>
          ${isActive
            ? html`<button class="btn btn-danger" @click=${this.cancelSerialFlash}>Cancel</button>`
            : html`<button class="btn btn-primary" ?disabled=${!this.selectedSerialPort || this.serialPortsLoading} @click=${this.startSerialFlash}>Flash selected port</button>`}
        </div>

        ${this.serialStatus ? html`
          <p class="serial-status ${status}">
            ${status === 'success'
              ? `USB flash complete${this.serialStatus.flashed_bytes ? ` (${Math.round(this.serialStatus.flashed_bytes / 1024)} KB)` : ''}`
              : status === 'failed'
                ? 'USB flash failed'
                : status === 'flashing'
                  ? `Flashing ${this.serialStatus.port || this.selectedSerialPort}...`
                  : status === 'starting'
                    ? 'Starting USB flash...'
                    : 'USB flash idle'}
          </p>
        ` : nothing}

        ${this.serialError ? html`<p class="error">${this.serialError}</p>` : nothing}

        ${this.serialLogs.length > 0 ? html`
          <div class="serial-log">
            <pre>${this.serialLogs.join('\n')}</pre>
          </div>
        ` : nothing}
      </div>
    `;
  }

  static styles = css`
    .config-page {
      color: var(--ink);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .config-header {
      display: flex;
      align-items: end;
      gap: 16px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
    }
    .back {
      border: 1px solid var(--line);
      background: var(--surface);
      min-height: 36px;
      padding: 0 14px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.12s;
    }
    .back:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .header-info {
      flex: 1;
      min-width: 0;
    }
    .header-info h2 {
      margin: 0;
      font-size: clamp(18px, 2.5vw, 26px);
      font-weight: 700;
      line-height: 1.1;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .header-info p {
      margin: 4px 0 0;
      font-size: 13px;
      color: var(--muted);
    }
    .ok { color: var(--ok); }
    .danger { color: var(--danger); }
    .device-type-tag {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      color: #475569;
      vertical-align: middle;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 20px 24px;
      margin-bottom: 16px;
    }
    .no-config {
      text-align: center;
    }
    .no-config h3 {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 18px;
    }
    .no-config-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-bottom: 16px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
      min-height: 38px;
    }
    .btn:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }
    .btn-primary:hover {
      background: #0d4d5e;
    }
    .btn-success {
      background: var(--ok);
      color: #fff;
      border-color: var(--ok);
    }
    .btn-success:hover {
      background: #16a34a;
    }
    .btn-danger {
      background: var(--danger);
      color: #fff;
      border-color: var(--danger);
    }
    .btn-danger:hover {
      background: #dc2626;
    }
    .hint {
      font-size: 12px;
      color: var(--muted);
      margin: 4px 0;
    }

    .yaml-warnings {
      border: 1px solid var(--accent);
      background: #fffbeb;
      border-radius: 8px;
      padding: 10px 14px;
      margin-top: 8px;
    }
    .yaml-warnings p {
      font-size: 12px;
      color: #7c3f00;
      margin: 4px 0;
      font-weight: 500;
    }

    .queue-banner {
      border: 1px solid var(--accent);
      background: #fffbeb;
      border-radius: 8px;
      padding: 12px 16px;
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .queue-banner strong {
      font-size: 14px;
      font-weight: 600;
    }
    .queue-banner small {
      color: var(--muted);
      font-size: 11px;
    }

    .action-bar {
      display: flex;
      gap: 8px;
      padding: 16px 0 8px;
      border-top: 1px solid var(--line);
      margin-top: 12px;
    }

    .cancel-link {
      border: 1px solid var(--danger);
      background: transparent;
      color: var(--danger);
      font: inherit;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .cancel-link:hover {
      background: var(--danger);
      color: white;
    }
    .btn-link {
      border: none;
      background: transparent;
      color: var(--primary);
      font: inherit;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      padding: 0 4px;
      text-decoration: underline;
    }
    .btn-link:hover {
      color: var(--ink);
    }
    .close-logs-link {
      margin-left: auto;
      border: 1px solid rgba(255,255,255,0.1);
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .close-logs-link:hover {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }

    .status-line {
      font-size: 11px;
      color: var(--muted);
      margin: 4px 0 0;
    }

    .success-section,
    .fail-section {
      margin-top: 10px;
    }
    .success-banner {
      background: #dcfce7;
      color: #166534;
      border: 1px solid var(--ok);
      border-radius: 8px;
      padding: 8px 12px;
      font-weight: 600;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .fail-banner {
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid var(--danger);
      border-radius: 8px;
      padding: 8px 12px;
      font-weight: 600;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .build-info {
      font-size: 13px;
      color: var(--muted);
      margin: 6px 0;
    }
    .flash-actions {
      display: flex;
      gap: 8px;
      margin: 10px 0;
      flex-wrap: wrap;
    }
    .serial-panel {
      border: 1px solid var(--line);
      background: #f8fafc;
      border-radius: 8px;
      padding: 12px;
      display: grid;
      gap: 10px;
      margin-top: 8px;
    }
    .serial-controls {
      display: flex;
      gap: 8px;
      align-items: end;
      flex-wrap: wrap;
    }
    .serial-controls label {
      display: grid;
      gap: 4px;
      font-size: 11px;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 600;
      min-width: min(280px, 100%);
    }
    .serial-controls select {
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      color: var(--ink);
      padding: 0 10px;
      font: inherit;
      font-size: 13px;
    }
    .serial-status {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--muted);
    }
    .serial-status.success { color: var(--ok); }
    .serial-status.failed { color: var(--danger); }
    .serial-status.flashing,
    .serial-status.starting { color: var(--primary); }
    .serial-log {
      max-height: 240px;
      overflow: auto;
      background: #1a1b1e;
      border-radius: 8px;
      padding: 10px;
    }
    .serial-log pre {
      margin: 0;
      color: #c0c5ce;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
      line-height: 1.4;
    }
    .warnings {
      border-left: 4px solid var(--accent);
      background: #fffbeb;
      padding: 12px;
      border-radius: 6px;
      display: grid;
      gap: 8px;
      margin: 8px 0;
    }
    .warnings p {
      margin: 0;
      font-size: 13px;
      color: #7c3f00;
    }
    .warnings label {
      font-weight: 500;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .error {
      color: var(--danger);
      font-size: 13px;
      font-weight: 500;
      padding: 10px 12px;
      background: #fef2f2;
      border: 1px solid var(--danger);
      border-radius: 6px;
    }

    .chip-error-banner {
      background: #fef2f2;
      border: 2px solid #b91c1c;
      color: #991b1b;
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 13px;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .chip-error-banner .dismiss-btn {
      background: transparent;
      border: none;
      font-size: 16px;
      cursor: pointer;
      color: #991b1b;
      padding: 0 4px;
      width: auto;
      min-height: auto;
      border-radius: 0;
      transform: none;
    }

    .chip-error-banner .dismiss-btn:hover {
      color: #7f1d1d;
      background: transparent;
      border-color: transparent;
      transform: none;
    }

    .compare-table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 13px;
    }
    .compare-table th,
    .compare-table td {
      border: 1px solid var(--line);
      padding: 8px 10px;
      text-align: left;
    }
    .compare-table th {
      background: #f8fafc;
      font-size: 11px;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 600;
    }
    .tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-left: 4px;
    }
    .tag.match {
      background: #dcfce7;
      color: #166534;
    }
    .tag.mismatch {
      background: #fef2f2;
      color: #991b1b;
    }

    .compile-focus-view {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      min-height: 400px;
      background: #1a1b1e;
    }
    .compile-status-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: var(--primary);
      color: white;
      font-size: 13px;
      font-weight: 600;
    }
    .compile-spinner {
      font-size: 16px;
      animation: spin 1.5s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .compile-elapsed {
      margin-left: auto;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      opacity: 0.85;
    }
    .expanded-log {
      flex: 1;
      min-height: 400px;
      --log-body-max: none;
    }
    .expanded-log .log-body {
      max-height: var(--log-body-max, none);
      height: 100%;
    }
    .bottom-log {
      margin-top: 8px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'esp-config-page': EspConfigPage;
  }
}
