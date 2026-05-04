import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ConfigResult, TopologyNode, api, normalizeMac } from '../api/client';

type ToastTone = 'ok' | 'error';

@customElement('esp-device-config')
export class EspDeviceConfig extends LitElement {
  @property({ type: String }) mac = '';
  @property({ type: Boolean }) online = false;
  @property({ type: Boolean }) isRemote = false;
  @property({ type: Array }) relayNodes: TopologyNode[] = [];
  @property({ type: Boolean }) relayEnabled = false;
  @state() private busy = '';
  @state() private heartbeatSeconds = 60;
  @state() private selectedParent = '';
  @state() private manualParent = '';
  @state() private clearParents = true;
  @state() private toast: { message: string; tone: ToastTone } | null = null;
  private toastTimer: number | undefined;

  disconnectedCallback(): void {
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    super.disconnectedCallback();
  }

  private disabled(command = ''): boolean {
    return !this.online || !!this.busy || (!!command && this.busy !== command);
  }

  private notify(message: string, tone: ToastTone): void {
    this.toast = { message, tone };
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast = null;
    }, 4500);
  }

  private dispatchChanged(): void {
    this.dispatchEvent(new CustomEvent('config-changed', { bubbles: true, composed: true }));
  }

  private async run(command: string, confirmText: string, action: () => Promise<ConfigResult>): Promise<void> {
    if (!window.confirm(confirmText)) return;
    this.busy = command;
    try {
      const result = await action();
      if (result.result === 'ok') {
        this.notify(`${result.command} accepted`, 'ok');
        this.dispatchChanged();
      } else {
        this.notify(`${result.command} returned ${result.result}`, 'error');
      }
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      this.busy = '';
    }
  }

  private reboot(): Promise<void> {
    return this.run('reboot', 'Reboot this remote now?', () => api.rebootDevice(this.mac));
  }

  private rediscover(): Promise<void> {
    return this.run('rediscover', 'Force this remote to rediscover its parent route?', () => api.forceRediscover(this.mac));
  }

  private applyHeartbeat(): Promise<void> {
    const interval = Math.trunc(Number(this.heartbeatSeconds));
    if (interval < 5 || interval > 3600) {
      this.notify('Heartbeat must be 5-3600 seconds', 'error');
      return Promise.resolve();
    }
    return this.run(
      'heartbeat',
      `Set heartbeat interval to ${interval} seconds?`,
      () => api.setHeartbeatInterval(this.mac, interval),
    );
  }

  private applyParent(): Promise<void> {
    const parentMac = normalizeMac((this.manualParent || this.selectedParent).trim());
    if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(parentMac)) {
      this.notify('Parent MAC is invalid', 'error');
      return Promise.resolve();
    }
    return this.run(
      'parent',
      `Set preferred parent to ${parentMac}?`,
      () => api.setParentMac(this.mac, parentMac, this.clearParents),
    );
  }

  private toggleRelay(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const enable = input.checked;
    if (!window.confirm(`${enable ? 'Enable' : 'Disable'} relay mode for this remote?`)) {
      input.checked = this.relayEnabled;
      return;
    }
    this.busy = 'relay';
    api.setRelay(this.mac, enable)
      .then((result) => {
        if (result.result === 'ok') {
          this.notify(`${result.command} accepted`, 'ok');
          this.dispatchChanged();
        } else {
          this.notify(`${result.command} returned ${result.result}`, 'error');
          input.checked = this.relayEnabled;
        }
      })
      .catch((error) => {
        this.notify(error instanceof Error ? error.message : String(error), 'error');
        input.checked = this.relayEnabled;
      })
      .finally(() => {
        this.busy = '';
      });
  }

  render() {
    if (!this.isRemote) return nothing;
    const relayOptions = this.relayNodes.filter((node) => normalizeMac(node.mac) !== normalizeMac(this.mac));
    const hasParent = !!(this.manualParent.trim() || this.selectedParent);

    return html`
      <section class="config-panel">
        <div class="title-row">
          <div>
            <span>Management</span>
            <h2>Device Controls</h2>
          </div>
          ${this.busy ? html`<small class="busy">${this.busy}</small>` : nothing}
        </div>

        ${!this.online ? html`<div class="offline">Device offline</div>` : nothing}

        <div class="command-row">
          <button class="danger" ?disabled=${this.disabled()} @click=${this.reboot}>Reboot</button>
          <button ?disabled=${this.disabled()} @click=${this.rediscover}>Force Rediscover</button>
        </div>

        <div class="field-row">
          <label>
            <span>Heartbeat</span>
            <input
              type="number"
              min="5"
              max="3600"
              step="1"
              .value=${String(this.heartbeatSeconds)}
              ?disabled=${this.disabled()}
              @input=${(event: Event) => { this.heartbeatSeconds = Number((event.target as HTMLInputElement).value); }}
            />
          </label>
          <button ?disabled=${this.disabled() || this.heartbeatSeconds < 5 || this.heartbeatSeconds > 3600} @click=${this.applyHeartbeat}>Apply</button>
        </div>

        <div class="parent-block">
          <label>
            <span>Parent</span>
            <select
              .value=${this.selectedParent}
              ?disabled=${this.disabled()}
              @change=${(event: Event) => { this.selectedParent = (event.target as HTMLSelectElement).value; }}
            >
              <option value="">Select parent</option>
              ${relayOptions.map((node) => html`
                <option value=${normalizeMac(node.mac)}>
                  ${node.friendly_name || node.esphome_name || node.label || normalizeMac(node.mac)}
                </option>
              `)}
            </select>
          </label>
          <label>
            <span>Manual MAC</span>
            <input
              type="text"
              autocomplete="off"
              placeholder="AA:BB:CC:DD:EE:FF"
              .value=${this.manualParent}
              ?disabled=${this.disabled()}
              @input=${(event: Event) => { this.manualParent = (event.target as HTMLInputElement).value; }}
            />
          </label>
          <label class="check">
            <input
              type="checkbox"
              .checked=${this.clearParents}
              ?disabled=${this.disabled()}
              @change=${(event: Event) => { this.clearParents = (event.target as HTMLInputElement).checked; }}
            />
            <span>Clear existing parents</span>
          </label>
          <button ?disabled=${this.disabled() || !hasParent} @click=${this.applyParent}>Apply Parent</button>
        </div>

        <label class="switch-row">
          <span>Relay Mode</span>
          <input
            type="checkbox"
            .checked=${this.relayEnabled}
            ?disabled=${this.disabled()}
            @change=${this.toggleRelay}
          />
        </label>

        ${this.toast ? html`<div class="toast ${this.toast.tone}">${this.toast.message}</div>` : nothing}
      </section>
    `;
  }

  static styles = css`
    .config-panel {
      position: relative;
      display: grid;
      gap: 16px;
    }

    .title-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
    }

    .title-row span,
    label > span {
      display: block;
      color: #64748b;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      margin-bottom: 5px;
    }

    h2 {
      margin: 0;
      color: #0f172a;
      font-size: 20px;
      line-height: 1.1;
    }

    .busy {
      color: #0f766e;
      font-weight: 700;
      text-transform: uppercase;
    }

    .offline {
      border: 1px solid #fecaca;
      background: #fef2f2;
      color: #991b1b;
      border-radius: 8px;
      padding: 9px 11px;
      font-size: 13px;
      font-weight: 700;
    }

    .command-row,
    .field-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      align-items: end;
    }

    .parent-block {
      display: grid;
      gap: 10px;
    }

    input,
    select,
    button {
      width: 100%;
      min-height: 38px;
      box-sizing: border-box;
      border-radius: 8px;
      font: inherit;
      font-size: 13px;
    }

    input,
    select {
      border: 1px solid #cbd5e1;
      background: #fff;
      padding: 0 10px;
    }

    button {
      border: 1px solid #0f766e;
      background: #0f766e;
      color: #fff;
      padding: 0 12px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.12s, background 0.12s, border-color 0.12s;
    }

    button:hover:not(:disabled) {
      background: #115e59;
      border-color: #115e59;
      transform: translateY(-1px);
    }

    button.danger {
      background: #b91c1c;
      border-color: #b91c1c;
    }

    button.danger:hover:not(:disabled) {
      background: #991b1b;
      border-color: #991b1b;
    }

    button:disabled,
    input:disabled,
    select:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .check,
    .switch-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 38px;
    }

    .check input,
    .switch-row input {
      width: 42px;
      min-height: 22px;
      accent-color: #0f766e;
    }

    .check span,
    .switch-row span {
      margin: 0;
      color: #334155;
      font-size: 13px;
      font-weight: 700;
      text-transform: none;
    }

    .toast {
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 13px;
      font-weight: 700;
      border: 1px solid;
    }

    .toast.ok {
      background: #ecfdf5;
      color: #065f46;
      border-color: #a7f3d0;
    }

    .toast.error {
      background: #fff7ed;
      color: #9a3412;
      border-color: #fed7aa;
    }

    @media (max-width: 760px) {
      .command-row,
      .field-row {
        grid-template-columns: 1fr;
      }
    }
  `;
}
