import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TopologyNode, api, normalizeMac } from '../api/client';

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
  @state() private customParentMac = '';
  @state() private showRelayModal = false;
  @state() private showHeartbeatModal = false;
  @state() private showParentModal = false;
  @state() private parentDropdownOpen = false;
  @state() private showConfirmModal = '';
  @state() private confirmAction: (() => void) | null = null;
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

  private configError(command: string, result: string | undefined, raw: unknown): void {
    if (result === undefined) {
      console.error('Unexpected config response:', raw);
      this.notify(`${command} returned an unexpected response`, 'error');
      return;
    }
    const errorMessages: Record<string, string> = {
      rejected: 'Config Fail Device Rejected',
      busy: 'Config Fail Device Busy',
      timeout: 'Config Fail Device Timeout',
      no_session: 'Config Fail No Session',
      not_remote: 'Config Fail Not Remote',
      invalid_payload: 'Config Fail Invalid Payload',
      unsupported: 'Config Fail Unsupported',
    };
    const msg = errorMessages[result] ?? `${command} returned ${result}`;
    this.notify(msg, 'error');
  }

  private dispatchChanged(): void {
    this.dispatchEvent(new CustomEvent('config-changed', { bubbles: true, composed: true }));
  }

  private reboot(): void {
    this.showConfirmModal = 'Reboot';
    this.confirmAction = () => {
      this.busy = 'reboot';
      api.rebootDevice(this.mac)
        .then((result) => {
          if (result.result === 'ok') {
            this.notify('Reboot command accepted', 'ok');
            this.dispatchChanged();
          } else {
            this.configError(result.command, result.result, result);
          }
        })
        .catch((error) => {
          this.notify(error instanceof Error ? error.message : String(error), 'error');
        })
        .finally(() => {
          this.busy = '';
        });
    };
  }

  private rediscover(): void {
    this.showConfirmModal = 'Rediscover';
    this.confirmAction = () => {
      this.busy = 'rediscover';
      api.forceRediscover(this.mac)
        .then((result) => {
          if (result.result === 'ok') {
            this.notify('Rediscover command accepted', 'ok');
            this.dispatchChanged();
          } else {
            this.configError(result.command, result.result, result);
          }
        })
        .catch((error) => {
          this.notify(error instanceof Error ? error.message : String(error), 'error');
        })
        .finally(() => {
          this.busy = '';
        });
    };
  }

  private applyHeartbeat(): Promise<void> {
    const interval = Math.trunc(Number(this.heartbeatSeconds));
    if (interval < 5 || interval > 3600) {
      this.notify('Heartbeat must be 5-3600 seconds', 'error');
      return Promise.resolve();
    }
    this.showHeartbeatModal = false;
    this.busy = 'heartbeat';
    return api.setHeartbeatInterval(this.mac, interval)
      .then((result) => {
        if (result.result === 'ok') {
          this.notify('Heartbeat interval set', 'ok');
          this.dispatchChanged();
        } else {
          this.configError(result.command, result.result, result);
        }
      })
      .catch((error) => {
        this.notify(error instanceof Error ? error.message : String(error), 'error');
      })
      .finally(() => {
        this.busy = '';
      });
  }

  private applyParent(replaceAll: boolean): void {
    const parentMac = normalizeMac((this.customParentMac || this.selectedParent).trim());
    if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(parentMac)) {
      this.notify('Parent MAC is invalid', 'error');
      return;
    }
    this.showParentModal = false;
    this.busy = 'parent';
    api.setParentMac(this.mac, parentMac, replaceAll)
      .then((result) => {
        if (result.result === 'ok') {
          this.notify('Parent set', 'ok');
          this.dispatchChanged();
        } else {
          this.configError(result.command, result.result, result);
        }
      })
      .catch((error) => {
        this.notify(error instanceof Error ? error.message : String(error), 'error');
      })
      .finally(() => {
        this.busy = '';
      });
  }

  private openRelayModal(): void {
    this.showRelayModal = true;
  }

  private closeRelayModal(): void {
    this.showRelayModal = false;
  }

  private applyRelayModal(enable: boolean): void {
    this.showRelayModal = false;
    this.busy = 'relay';
    api.setRelay(this.mac, enable)
      .then((result) => {
        const isSuccess = result.result !== undefined && !['no_session', 'timeout', 'rejected', 'busy', 'invalid_payload', 'not_remote'].includes(result.result);
        if (isSuccess) {
          const msg = result.result === 'ok'
            ? (enable ? 'Relay Enabled Successfully' : 'Relay Disabled Successfully')
            : result.result;
          this.notify(msg, 'ok');
          this.dispatchChanged();
        } else {
          this.configError(result.command, result.result, result);
        }
      })
      .catch((error) => {
        this.notify(error instanceof Error ? error.message : String(error), 'error');
      })
      .finally(() => {
        this.busy = '';
      });
  }

  

  render() {
    if (!this.isRemote) return nothing;

    return html`
      <section class="config-panel">
        <div class="title-row">
          <div>
            <h2>Device Controls</h2>
          </div>
          ${this.busy ? html`<small class="busy">${this.busy}</small>` : nothing}
        </div>

        ${!this.online ? html`<div class="offline">Device offline</div>` : nothing}

        <div class="command-row three">
          <button class="danger" ?disabled=${this.disabled()} @click=${this.reboot}>Reboot</button>
          <button ?disabled=${this.disabled()} @click=${this.rediscover}>Force Rediscover</button>
          <button ?disabled=${this.disabled()} @click=${this.openRelayModal}>Relay Config</button>
        </div>

        <div class="command-row three">
          <button class="config-btn" ?disabled=${this.disabled()} @click=${() => { this.showHeartbeatModal = true; }}>Set Heartbeat</button>
          <div></div>
          <button class="config-btn" ?disabled=${this.disabled()} @click=${() => { this.showParentModal = true; }}>Set Parent</button>
        </div>

        ${this.showRelayModal ? this.renderRelayModal() : nothing}
        ${this.showHeartbeatModal ? this.renderHeartbeatModal() : nothing}
        ${this.showParentModal ? this.renderParentModal() : nothing}
        ${this.showConfirmModal ? this.renderConfirmModal() : nothing}

        ${this.toast ? html`<div class="toast ${this.toast.tone}">${this.toast.message}</div>` : nothing}
      </section>
    `;
  }

  private renderRelayModal() {
    return html`
      <div class="modal-backdrop" @click=${this.handleBackdropClick}>
        <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
          <h3>Relay Config</h3>
          <p>Configure relay mode for this device.</p>
          <div class="modal-actions">
            <button @click=${() => this.applyRelayModal(true)} ?disabled=${this.disabled()}>Enable Relay</button>
            <button @click=${() => this.applyRelayModal(false)} ?disabled=${this.disabled()}>Disable Relay</button>
            <button class="cancel" @click=${this.closeRelayModal}>Cancel</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderHeartbeatModal() {
    return html`
      <div class="modal-backdrop" @click=${this.handleBackdropClick}>
        <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
          <h3>Set Heartbeat</h3>
          <label>
            <span>Interval (seconds)</span>
            <input
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              min="5"
              max="3600"
              .value=${String(this.heartbeatSeconds)}
              @input=${(event: Event) => { this.heartbeatSeconds = Number((event.target as HTMLInputElement).value); }}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.applyHeartbeatFromModal(); }}
            />
          </label>
          <div class="modal-actions">
            <button @click=${this.applyHeartbeatFromModal} ?disabled=${this.disabled() || this.heartbeatSeconds < 5 || this.heartbeatSeconds > 3600}>Set</button>
            <button class="cancel" @click=${() => { this.showHeartbeatModal = false; }}>Cancel</button>
          </div>
        </div>
      </div>
    `;
  }

  private handleBackdropClick(e: Event): void {
    const target = e.target as HTMLElement;
    if (target.classList.contains('modal-backdrop')) {
      this.showHeartbeatModal = false;
      this.showParentModal = false;
      this.showConfirmModal = '';
    }
  }

  private renderParentModal() {
    const hasParent = !!(this.customParentMac.trim() || this.selectedParent);
    const relayOptions = this.relayNodes.filter((node) => normalizeMac(node.mac) !== normalizeMac(this.mac));
    return html`
      <div class="modal-backdrop" @click=${this.handleBackdropClick}>
        <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
          <h3>Set Parent</h3>
          <p class="callout">Configures the remote device's preferred parent - is not blocking so if remote cannot reach the parent it may select an alternate</p>
          <label>
            <span>Parent</span>
            <select
              .value=${this.selectedParent}
              ?disabled=${this.disabled()}
              @change=${(event: Event) => {
                const value = (event.target as HTMLSelectElement).value;
                if (value === '__custom__') {
                  this.parentDropdownOpen = true;
                  this.selectedParent = '';
                } else {
                  this.selectedParent = value;
                  this.customParentMac = '';
                  this.parentDropdownOpen = false;
                }
              }}
            >
              <option value="">Select parent</option>
              ${relayOptions.map((node) => html`
                <option value=${normalizeMac(node.mac)}>
                  ${node.friendly_name || node.esphome_name || node.label || normalizeMac(node.mac)}
                </option>
              `)}
              <option value="__custom__">Custom MAC...</option>
            </select>
          </label>
          ${this.parentDropdownOpen ? html`
            <label class="custom-mac-label">
              <span>Custom MAC</span>
              <input
                type="text"
                autocomplete="off"
                placeholder="AA:BB:CC:DD:EE:FF"
                .value=${this.customParentMac}
                ?disabled=${this.disabled()}
                @input=${(event: Event) => { this.customParentMac = (event.target as HTMLInputElement).value; }}
              />
            </label>
          ` : nothing}
          ${this.customParentMac ? html`<div class="custom-mac-display">Custom: ${this.customParentMac}</div>` : nothing}
          <div class="modal-actions two">
            <button @click=${() => this.applyParentFromModal(true)} ?disabled=${this.disabled() || !hasParent}>Set Parent Replace All Parents</button>
            <button @click=${() => this.applyParentFromModal(false)} ?disabled=${this.disabled() || !hasParent}>Set Parent Add to List</button>
          </div>
          <div class="modal-actions">
            <button class="cancel" @click=${() => { this.showParentModal = false; }}>Cancel</button>
          </div>
        </div>
      </div>
    `;
  }

  private applyHeartbeatFromModal(): void {
    void this.applyHeartbeat();
  }

  private applyParentFromModal(replaceAll: boolean): void {
    this.showParentModal = false;
    this.parentDropdownOpen = false;
    this.applyParent(replaceAll);
  }

  private renderConfirmModal() {
    const isReboot = this.showConfirmModal === 'Reboot';
    return html`
      <div class="modal-backdrop" @click=${this.handleBackdropClick}>
        <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
          <h3>${isReboot ? 'Reboot Device' : 'Force Rediscover'}</h3>
          <p class="callout">${isReboot ? 'Are you sure you want to reboot this device?' : 'Force this device to rediscover its parent route?'}</p>
          <div class="modal-actions two">
            <button @click=${() => {
              const action = this.confirmAction;
              this.showConfirmModal = '';
              this.confirmAction = null;
              if (action) action();
            }} ?disabled=${this.disabled()}>Go</button>
            <button class="cancel" @click=${() => { this.showConfirmModal = ''; this.confirmAction = null; }}>Cancel</button>
          </div>
        </div>
      </div>
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
    .field-row,
    .config-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      align-items: end;
    }

    .command-row.three {
      grid-template-columns: 1fr 1fr 1fr;
    }

    .config-btn {
      width: 100%;
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

    .check {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 38px;
    }

    .check input {
      width: 42px;
      min-height: 22px;
      accent-color: #0f766e;
    }

    .check span {
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

    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      width: 90%;
      max-width: 380px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    }

    .modal h3 {
      margin: 0 0 16px 0;
      color: #0f172a;
      font-size: 18px;
    }

    .modal label {
      display: block;
    }

    .modal label span {
      display: block;
      color: #64748b;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      margin-bottom: 5px;
    }

    .modal input {
      width: 100%;
      min-height: 38px;
      box-sizing: border-box;
      border-radius: 8px;
      font: inherit;
      font-size: 13px;
      border: 1px solid #cbd5e1;
      background: #fff;
      padding: 0 10px;
    }

    .modal-actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
      justify-content: flex-end;
    }

    .modal-actions button {
      width: auto;
      min-width: 80px;
      padding: 0 16px;
    }

    .modal-actions button.cancel {
      background: #fff;
      border-color: #cbd5e1;
      color: #64748b;
    }

    .modal-actions button.cancel:hover:not(:disabled) {
      background: #f1f5f9;
      border-color: #94a3b8;
      transform: none;
    }

    .modal-actions.two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 20px;
    }

    .modal-actions.two button {
      width: 100%;
      min-width: auto;
    }

    .callout {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12px;
      color: #64748b;
      margin: 0 0 16px 0;
    }

    .custom-mac-label {
      display: block;
      margin-top: 10px;
    }

    .custom-mac-display {
      font-size: 12px;
      color: #64748b;
      padding: 4px 0;
    }

    @media (max-width: 760px) {
      .command-row,
      .field-row,
      .command-row.three {
        grid-template-columns: 1fr;
      }
    }
  `;
}
