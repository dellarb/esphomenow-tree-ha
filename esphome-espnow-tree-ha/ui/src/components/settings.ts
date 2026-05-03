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
    if (this.loading) return html`<section class="card">Loading settings...</section>`;
    const active = this.config?.active_bridge || {};
    return html`
      <section class="card">
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
          <button class="btn btn-primary" ?disabled=${this.saving || !this.bridgeHost.trim() || (this.bridgeHost.trim() === this.originalHost.trim() && this.bridgePort === this.originalPort)} @click=${this.save}>Save and validate</button>
          <button class="btn" ?disabled=${this.saving} @click=${this.clear}>Use auto-discovery</button>
          <button class="btn" ?disabled=${this.saving} @click=${() => void this.load()}>Refresh</button>
        </div>

        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
        ${this.saved ? html`<p class="saved">${this.saved}</p>` : nothing}
      </section>

      <section class="card">
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
          <button class="btn btn-danger" ?disabled=${this.cleaningArtifacts} @click=${this.cleanArtifacts}>Clean build artifacts</button>
        </div>

        ${this.artifactsMessage ? html`<p class="info">${this.artifactsMessage}</p>` : nothing}

        <p class="hint">Clean build artifacts removes PlatformIO cache and ESPHome build output. Useful for freeing space or resolving stale build state.</p>
      </section>
    `;
  }

  static styles = css`
    .card {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 16px 20px;
      display: grid;
      gap: 16px;
      margin-bottom: 16px;
    }

    .title span,
    .current span {
      color: var(--primary);
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
    }

    h2 {
      margin: 3px 0 0;
      font-size: 16px;
      font-weight: 600;
    }

    .current {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 8px;
    }

    .current > div {
      background: #f8fafc;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #f1f5f9;
    }

    .current span {
      display: block;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .current strong {
      display: block;
      margin-top: 4px;
      overflow-wrap: anywhere;
      font-size: 14px;
      font-weight: 500;
    }

    .ok { color: var(--ok); }
    .danger { color: var(--danger); }

    .unavailable-note {
      background: #fef2f2;
      border: 1px solid var(--danger);
      padding: 12px;
      border-radius: 8px;
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
      gap: 12px;
    }

    label {
      display: grid;
      gap: 4px;
      font-weight: 500;
      font-size: 13px;
    }

    input {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      min-height: 38px;
      padding: 8px 12px;
      font: inherit;
      font-size: 14px;
      background: var(--surface);
      color: var(--ink);
      transition: border-color 0.12s;
    }

    input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(11,59,75,0.1);
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
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

    .btn-danger {
      background: var(--danger);
      color: #fff;
      border-color: var(--danger);
    }

    .btn-danger:hover {
      background: #dc2626;
    }

    button:disabled,
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .error,
    .saved,
    .info {
      margin: 0;
      font-weight: 500;
      font-size: 13px;
    }

    .error {
      color: var(--danger);
      padding: 10px 12px;
      background: #fef2f2;
      border: 1px solid var(--danger);
      border-radius: 6px;
    }

    .saved {
      color: var(--ok);
      padding: 10px 12px;
      background: #dcfce7;
      border: 1px solid var(--ok);
      border-radius: 6px;
    }

    .info {
      color: var(--primary);
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