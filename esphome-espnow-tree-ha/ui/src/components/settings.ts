import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { AppConfig, ContainerStatusInfo, api } from '../api/client';

@customElement('esp-settings')
export class EspSettings extends LitElement {
  @state() private config: AppConfig | null = null;
  @state() private bridgeHost = '';
  @state() private bridgePort = 80;
  @state() private originalHost = '';
  @state() private originalPort = 80;
  @state() private loading = true;
  @state() private saving = false;
  @state() private error = '';
  @state() private saved = '';
  @state() private containerStatus: ContainerStatusInfo | null = null;
  @state() private cleaningArtifacts = false;
  @state() private artifactsMessage = '';

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
    void this.loadContainerStatus();
  }

  private async load(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.config = await api.config();
      const active = this.config.active_bridge || {};
      const bridge = this.config.bridge || {};
      this.bridgeHost = String(bridge.bridge_host || active.host || '');
      this.bridgePort = Number(bridge.bridge_host ? bridge.bridge_port : (active.port || 80));
      this.originalHost = this.bridgeHost;
      this.originalPort = this.bridgePort;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
    }
  }

  private async loadContainerStatus(): Promise<void> {
    try {
      this.containerStatus = await api.getContainerStatus();
    } catch {
      this.containerStatus = null;
    }
  }

  private async save(): Promise<void> {
    this.saving = true;
    this.error = '';
    this.saved = '';
    try {
      await api.setBridge(this.bridgeHost, this.bridgePort);
      this.saved = 'Bridge saved and validated.';
      await this.load();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.saving = false;
    }
  }

  private async clear(): Promise<void> {
    this.saving = true;
    this.error = '';
    this.saved = '';
    try {
      await api.clearBridge();
      this.saved = 'Manual override cleared.';
      await this.load();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.saving = false;
    }
  }

  private async cleanArtifacts(): Promise<void> {
    this.cleaningArtifacts = true;
    this.artifactsMessage = '';
    try {
      const result = await api.cleanArtifacts();
      const totalMB = (result.total_bytes / (1024 * 1024)).toFixed(1);
      this.artifactsMessage = `Cleared ${totalMB} MB of build cache. Next compile will be slower.`;
      void this.loadContainerStatus();
    } catch (error) {
      this.artifactsMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.cleaningArtifacts = false;
    }
  }

  render() {
    if (this.loading) return html`<section class="panel">Loading settings...</section>`;
    const active = this.config?.active_bridge || {};
    return html`
      <section class="panel">
        <div class="title">
          <span>Bridge</span>
          <h2>Connection</h2>
        </div>

        <div class="current">
          <div><span>Host</span><strong>${active.host || active.error || '-'}</strong></div>
          <div><span>Port</span><strong>${active.port || '-'}</strong></div>
          <div><span>Source</span><strong>${active.source || '-'}</strong></div>
          <div><span>HA API</span><strong>${this.config?.ha_api_available ? 'available' : 'missing token'}</strong></div>
        </div>

        <div class="form">
          <label>
            Bridge host
            <input .value=${this.bridgeHost} @input=${(event: Event) => (this.bridgeHost = (event.target as HTMLInputElement).value)} placeholder="192.168.1.50" />
          </label>
          <label>
            Port
            <input
              type="number"
              min="1"
              max="65535"
              .value=${String(this.bridgePort)}
              @input=${(event: Event) => (this.bridgePort = Number((event.target as HTMLInputElement).value || 80))}
            />
          </label>
        </div>

        <div class="actions">
          <button ?disabled=${this.saving || !this.bridgeHost.trim() || (this.bridgeHost.trim() === this.originalHost.trim() && this.bridgePort === this.originalPort)} @click=${this.save}>Save and validate</button>
          <button ?disabled=${this.saving} @click=${this.clear}>Use auto-discovery</button>
          <button ?disabled=${this.saving} @click=${() => void this.load()}>Refresh</button>
        </div>

        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
        ${this.saved ? html`<p class="saved">${this.saved}</p>` : nothing}
      </section>

      <section class="panel">
        <div class="title">
          <span>Compile</span>
          <h2>ESPHome</h2>
        </div>

        <div class="unavailable-note">
          <strong>Native compilation is not yet implemented.</strong>
          <p>ESPHome firmware compilation is not available in this build. The compile feature is disabled until native compilation is implemented.</p>
        </div>

        <div class="current">
          <div><span>Status</span><strong class="danger">Unavailable</strong></div>
          <div><span>Error</span><strong>${this.containerStatus?.error || 'Native compilation not implemented'}</strong></div>
        </div>

        <div class="actions">
          <button class="danger-btn" ?disabled=${this.cleaningArtifacts} @click=${this.cleanArtifacts}>Clean build artifacts</button>
        </div>

        ${this.artifactsMessage ? html`<p class="info">${this.artifactsMessage}</p>` : nothing}

        <p class="hint">Clean build artifacts removes PlatformIO cache and ESPHome build output. Useful for freeing space or resolving stale build state.</p>
      </section>
    `;
  }

  static styles = css`
    .panel {
      border: 2px solid var(--ink);
      background: var(--panel);
      box-shadow: var(--shadow);
      padding: 16px;
      display: grid;
      gap: 16px;
      margin-bottom: 16px;
    }

    .title span,
    .current span {
      color: var(--accent);
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 900;
    }

    h2 {
      margin: 3px 0 0;
      font-size: 24px;
    }

    .current {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 8px;
    }

    .current div {
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.58);
      padding: 10px;
      min-width: 0;
    }

    .current strong {
      display: block;
      margin-top: 5px;
      overflow-wrap: anywhere;
    }

    .ok { color: var(--ok); }
    .danger { color: var(--danger); }

    .unavailable-note {
      background: #fff1ed;
      border: 2px solid var(--danger);
      padding: 12px;
    }
    .unavailable-note strong {
      color: var(--danger);
      font-size: 14px;
      display: block;
      margin-bottom: 4px;
    }
    .unavailable-note p {
      margin: 2px 0;
      font-size: 12px;
      color: var(--ink);
    }

    .form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 140px;
      gap: 10px;
    }

    label {
      display: grid;
      gap: 6px;
      font-weight: 900;
    }

    input {
      border: 2px solid var(--ink);
      min-height: 38px;
      padding: 0 10px;
      font: inherit;
      background: white;
      color: var(--ink);
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    button {
      border: 2px solid var(--ink);
      background: var(--panel);
      min-height: 36px;
      padding: 0 12px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 3px 3px 0 var(--ink);
    }

    button:first-child {
      background: var(--accent);
      color: white;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
    }

    .danger-btn {
      background: var(--danger) !important;
      color: white !important;
      border-color: var(--danger) !important;
    }

    .error,
    .saved,
    .info {
      margin: 0;
      font-weight: 900;
    }

    .error {
      color: var(--danger);
    }

    .saved {
      color: var(--ok);
    }

    .info {
      color: var(--accent);
    }

    .hint {
      font-size: 11px;
      color: var(--muted);
      margin: 0;
    }

    @media (max-width: 760px) {
      .current,
      .form {
        grid-template-columns: 1fr;
      }
    }
  `;
}