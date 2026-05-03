import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import '../components/config-editor';
import '../components/compile-status';
import '../components/compile-log-viewer';
import { api, CompileStatusResponse, DeviceConfig, PreflightComparison } from '../api/client';

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
  @state() private compileJobId: number | null = null;
  @state() private compileQueuePosition: number | null = null;
  @state() private preflight: PreflightComparison | null = null;
  @state() private yamlWarnings: string[] = [];
  @state() private showCompileLog = true;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  disconnectedCallback(): void {
    this.stopPolling();
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

  private async load(): Promise<void> {
    this.state = 'loading';
    try {
      const [dev, configData] = await Promise.all([
        api.device(this.mac).catch(() => null),
        api.getConfig(this.mac).catch(() => null),
      ]);
      this.device = dev || {};
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
        this.stopPolling();
      } else if (status.status === 'idle') {
        if (this.compilePhase === 'queued_for_flash') {
          this.compilePhase = 'idle';
          this.compileJobId = null;
          this.compileQueuePosition = null;
        } else if (this.compilePhase === 'compile_queued' || this.compilePhase === 'compiling') {
          this.compilePhase = 'idle';
          this.compileJobId = null;
          this.compileQueuePosition = null;
        }
        this.stopPolling();
      } else if (status.status === 'failed') {
        this.compilePhase = 'failed';
        this.compileJobId = null;
        this.compileQueuePosition = null;
        this.stopPolling();
      } else if (status.error) {
        this.compilePhase = 'failed';
        this.error = status.error;
        this.stopPolling();
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
    this.error = '';
    this.showCompileLog = true;

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
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private async cancelCompile(): Promise<void> {
    try {
      await api.cancelCompile(this.mac);
      this.compilePhase = 'idle';
      this.compileJobId = null;
      this.compileQueuePosition = null;
      this.stopPolling();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
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

  private goBack(): void {
    window.location.hash = `/device/${encodeURIComponent(this.mac)}`;
  }

  private goToSecrets(): void {
    window.location.hash = '/secrets';
  }

  render() {
    const esphomeName = String(this.device?.esphome_name || this.device?.label || this.mac);
    const chipName = String(this.device?.chip_name || '-');
    const online = Boolean(this.device?.online);

    return html`
      <div class="config-page" data-job-id=${this.compileJobId ?? ''}>
        <header class="config-header">
          <button class="back" @click=${this.goBack}>&#8592; Back to device</button>
          <div class="header-info">
            <h2>${esphomeName}</h2>
            <p>${this.mac} &middot; ${chipName} &middot; <span class=${online ? 'ok' : 'danger'}>${online ? 'online' : 'offline'}</span></p>
          </div>
          <button class="secrets-link" @click=${this.goToSecrets}>Secrets &#9881;</button>
        </header>

        ${this.state === 'loading'
          ? html`<div class="card">Loading config...</div>`
          : this.state === 'no_config'
            ? html`
                <div class="card no-config">
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
                    <esp-config-editor
                    .value=${this.editorContent}
                    .readonly=${this.compilePhase === 'compiling' || this.compilePhase === 'compile_queued'}
                    @content-change=${this.onEditorChange}
                  ></esp-config-editor>

                  ${this.yamlWarnings.length > 0
                    ? html`<div class="yaml-warnings">${this.yamlWarnings.map((w) => html`<p>&#9888; ${w}</p>`)}</div>`
                    : nothing}

                  <esp-compile-log-viewer
                    .mac=${this.mac}
                    .visible=${(this.compilePhase === 'compiling' || this.compilePhase === 'compile_queued' || this.compilePhase === 'queued_for_flash' || this.compilePhase === 'failed') && this.showCompileLog}
                  ></esp-compile-log-viewer>

                  ${this.compilePhase === 'compile_queued'
                    ? html`
                        <div class="queue-banner">
                          <strong>&#9203; Position ${this.compileQueuePosition !== null ? this.compileQueuePosition + 1 : '?'} in compile queue</strong>
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
                      ? html`<p class="status-line">Status: waiting to compile (#${this.compileQueuePosition !== null ? this.compileQueuePosition + 1 : '?'})</p>`
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
                          ${this.compileQueuePosition !== null && this.compileQueuePosition > 0
                            ? html`<p class="build-info">&#9203; Position ${this.compileQueuePosition + 1} in flash queue</p>`
                            : nothing
                          }
                  <div class="flash-actions">
                    <button class="btn btn-primary" @click=${this.flashNow}>&#9654; Flash via ESP-NOW</button>
                    <button class="btn" @click=${this.downloadFactory}>&#8595; Download factory .bin</button>
                  </div>
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
                          <p class="hint">Fix the YAML above and try again.</p>
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
    .header-info h2 {
      margin: 0;
      font-size: clamp(20px, 3vw, 32px);
      font-weight: 700;
      line-height: 1.1;
    }
    .header-info p {
      margin: 4px 0 0;
      font-size: 13px;
      color: var(--muted);
    }
    .ok { color: var(--ok); }
    .danger { color: var(--danger); }

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
    .config-header .secrets-link {
      margin-left: auto;
      border: 1px solid var(--line);
      background: transparent;
      padding: 8px 14px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      color: var(--muted);
      transition: all 0.12s;
    }
    .config-header .secrets-link:hover {
      border-color: var(--primary);
      color: var(--primary);
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
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'esp-config-page': EspConfigPage;
  }
}