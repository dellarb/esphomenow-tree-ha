import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import '../components/config-editor';
import '../components/compile-status';
import '../components/compile-log-viewer';
import { api, DeviceConfig } from '../api/client';

type PageState = 'loading' | 'no_config' | 'editor';

@customElement('esp-config-page')
export class EspConfigPage extends LitElement {
  @property({ type: String }) mac = '';
  @state() private state: PageState = 'loading';
  @state() private device: Record<string, unknown> | null = null;
  @state() private config: DeviceConfig | null = null;
  @state() private editorContent = '';
  @state() private saveIndicator = '';
  @state() private error = '';
  @state() private compilePhase: 'idle' | 'compiling' | 'success' | 'failed' = 'idle';
  @state() private yamlWarnings: string[] = [];

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
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
    } catch {
      this.state = 'no_config';
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
    if (this.compilePhase === 'compiling') return;
    this.compilePhase = 'compiling';
    this.error = '';

    try {
      const result = await api.compileDevice(this.mac);
      if (result.success) {
        this.compilePhase = 'success';
      } else {
        this.compilePhase = 'failed';
        this.error = result.error || 'compile failed';
      }
    } catch (err) {
      this.compilePhase = 'failed';
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private async cancelCompile(): Promise<void> {
    try {
      await api.cancelCompile(this.mac);
      this.compilePhase = 'idle';
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
      <div class="config-page">
        <header class="config-header">
          <button class="back" @click=${this.goBack}>&#8592; Back to device</button>
          <div class="header-info">
            <h2>${esphomeName}</h2>
            <p>${this.mac} &middot; ${chipName} &middot; <span class=${online ? 'ok' : 'danger'}>${online ? 'online' : 'offline'}</span></p>
          </div>
        </header>

        ${this.state === 'loading'
          ? html`<div class="panel">Loading config...</div>`
          : this.state === 'no_config'
            ? html`
                <div class="panel no-config">
                  <h3>No configuration yet for this device.</h3>
                  <div class="no-config-actions">
                    <button class="create-btn" @click=${this.createScaffold}>Create Config</button>
                    <button class="import-btn" @click=${this.importYaml}>Import YAML</button>
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
                    .readonly=${this.compilePhase === 'compiling'}
                    @content-change=${this.onEditorChange}
                  ></esp-config-editor>

                  ${this.yamlWarnings.length > 0
                    ? html`<div class="yaml-warnings">${this.yamlWarnings.map((w) => html`<p>&#9888; ${w}</p>`)}</div>`
                    : nothing}

                  ${this.compilePhase === 'compiling'
                    ? html`<esp-compile-log-viewer .mac=${this.mac}></esp-compile-log-viewer>`
                    : nothing}

                  <div class="action-bar">
                    <button class="save-btn" @click=${this.saveConfig} ?disabled=${this.compilePhase === 'compiling'}>
                      ${this.saveIndicator || 'Save'}
                    </button>
                    ${this.compilePhase === 'compiling'
                      ? html`<button class="cancel-btn" @click=${this.cancelCompile}>Cancel</button>`
                      : html`<button class="compile-btn" ?disabled=${!this.config} @click=${this.triggerCompile}>Compile & Install</button>`
                    }
                    <button class="secrets-link" @click=${this.goToSecrets}>Secrets &#9881;</button>
                  </div>

                  ${this.compilePhase === 'compiling'
                    ? html`<p class="status-line">Status: compiling...</p>`
                    : html`<p class="status-line">Status: ${this.saveIndicator ? 'saved' : 'unsaved'}</p>`}

                  ${this.error && this.compilePhase !== 'compiling'
                    ? html`<p class="error">${this.error}</p>`
                    : nothing}

                  ${this.compilePhase === 'success'
                    ? html`
                        <div class="success-section">
                          <div class="success-banner">&#10003; Build successful</div>
                          <p class="build-info">${esphomeName} &middot; ready for flash</p>
                          <div class="flash-actions">
                            <button class="flash-btn" @click=${this.flashNow}>&#9654; Flash via ESP-NOW</button>
                            <button class="download-btn" @click=${this.downloadFactory}>&#8595; Download factory .bin</button>
                          </div>
                          <p class="hint">Flashing begins immediately. You will be redirected to the device page to monitor progress.</p>
                        </div>
                      `
                    : nothing}

                  ${this.compilePhase === 'failed'
                    ? html`
                        <div class="fail-section">
                          <div class="fail-banner">&#10007; Build failed</div>
                          <p class="hint">Fix the YAML above and try again.</p>
                        </div>
                      `
                    : nothing}
                `
              : nothing}
      </div>
    `;
  }

  static styles = css`
    .config-page {
      color: var(--ink);
      font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
    }
    .config-header {
      display: flex;
      align-items: end;
      gap: 16px;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 2px solid var(--ink);
    }
    .back {
      border: 2px solid var(--ink);
      background: var(--panel);
      min-height: 36px;
      padding: 0 12px;
      font: inherit;
      font-weight: 900;
      box-shadow: 3px 3px 0 var(--ink);
      cursor: pointer;
      white-space: nowrap;
    }
    .header-info h2 {
      margin: 0;
      font-size: clamp(20px, 3vw, 32px);
      line-height: 1.1;
    }
    .header-info p {
      margin: 4px 0 0;
      font-size: 12px;
      color: var(--muted);
    }
    .ok { color: var(--ok); }
    .danger { color: var(--danger); }

    .panel {
      border: 2px solid var(--ink);
      background: var(--panel);
      padding: 24px;
      box-shadow: var(--shadow);
    }
    .no-config {
      text-align: center;
    }
    .no-config h3 {
      font-size: 16px;
      margin: 0 0 18px;
    }
    .no-config-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-bottom: 16px;
    }
    .create-btn,
    .import-btn {
      border: 2px solid var(--ink);
      padding: 10px 20px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      min-width: 160px;
    }
    .create-btn {
      background: var(--accent);
      color: white;
      box-shadow: 3px 3px 0 var(--ink);
    }
    .import-btn {
      background: var(--panel);
      box-shadow: 3px 3px 0 var(--ink);
    }
    .hint {
      font-size: 12px;
      color: var(--muted);
      margin: 4px 0;
    }

    .yaml-warnings {
      border: 2px solid var(--accent-2);
      background: #fff8ed;
      padding: 8px 12px;
      margin-top: 8px;
    }
    .yaml-warnings p {
      font-size: 12px;
      color: var(--accent-2);
      margin: 4px 0;
      font-weight: 700;
    }

    .action-bar {
      display: flex;
      gap: 8px;
      padding: 12px 0;
      border-top: 2px solid var(--line);
    }
    .save-btn {
      border: 2px solid var(--ink);
      background: var(--panel);
      padding: 8px 18px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 3px 3px 0 var(--ink);
    }
    .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .compile-btn {
      border: 2px solid var(--ok);
      background: var(--ok);
      color: white;
      padding: 8px 18px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 3px 3px 0 var(--ink);
      min-width: 180px;
    }
    .compile-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .cancel-btn {
      border: 2px solid var(--danger);
      background: var(--danger);
      color: white;
      padding: 8px 18px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 3px 3px 0 var(--ink);
    }
    .secrets-link {
      border: 1px solid var(--line);
      background: transparent;
      padding: 8px 14px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      color: var(--muted);
    }
    .secrets-link:hover {
      border-color: var(--ink);
      color: var(--ink);
    }

    .status-line {
      font-size: 11px;
      color: var(--muted);
      margin: 0;
    }

    .success-section,
    .fail-section {
      margin-top: 10px;
    }
    .success-banner {
      background: #dff8e8;
      color: var(--ok);
      border: 2px solid var(--ok);
      padding: 8px 12px;
      font-weight: 900;
      font-size: 14px;
    }
    .fail-banner {
      background: #fff1ed;
      color: var(--danger);
      border: 2px solid var(--danger);
      padding: 8px 12px;
      font-weight: 900;
      font-size: 14px;
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
    .flash-btn {
      border: 2px solid var(--ok);
      background: var(--ok);
      color: white;
      padding: 8px 16px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 3px 3px 0 var(--ink);
    }
    .download-btn {
      border: 2px solid var(--ink);
      background: var(--panel);
      padding: 8px 16px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 3px 3px 0 var(--ink);
    }
    .error {
      color: var(--danger);
      font-size: 13px;
      font-weight: 700;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'esp-config-page': EspConfigPage;
  }
}
