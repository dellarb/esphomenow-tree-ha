import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { OtaJob, TopologyNode, api, chipName, fmtBytes, jobIsActive, normalizeMac } from '../api/client';
import './ota-progress';

@customElement('esp-ota-box')
export class EspOtaBox extends LitElement {
  @property({ type: String }) mac = '';
  @property({ type: Object }) node!: TopologyNode;
  @property({ type: Object }) currentJob: OtaJob | null = null;
  @state() private pendingJob: OtaJob | null = null;
  @state() private firmware: Record<string, unknown> | null = null;
  @state() private warnings: string[] = [];
  @state() private acceptedWarnings = false;
  @state() private busy = false;
  @state() private error = '';

  updated(): void {
    if (this.currentJob && this.currentJob.status === 'pending_confirm') {
      this.pendingJob = this.currentJob;
      if (!this.warnings.length && this.currentJob.preflight_warnings) {
        try {
          const parsed = JSON.parse(this.currentJob.preflight_warnings);
          this.warnings = Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          this.warnings = [this.currentJob.preflight_warnings];
        }
      }
    }
  }

  private async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.busy = true;
    this.error = '';
    this.acceptedWarnings = false;
    try {
      const result = await api.uploadFirmware(this.mac, file);
      this.pendingJob = result.job;
      this.firmware = result.firmware;
      this.warnings = result.warnings || [];
      this.dispatchChanged();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      input.value = '';
    }
  }

  private async start(): Promise<void> {
    if (!this.pendingJob) return;
    this.busy = true;
    this.error = '';
    try {
      await api.startOta(this.pendingJob.id);
      this.pendingJob = null;
      this.dispatchChanged();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
    }
  }

  private async abort(): Promise<void> {
    this.busy = true;
    this.error = '';
    try {
      await api.abortOta();
      this.pendingJob = null;
      this.dispatchChanged();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
    }
  }

  private dispatchChanged(): void {
    this.dispatchEvent(new CustomEvent('ota-changed', { bubbles: true, composed: true }));
  }

  render() {
    const activeForThis = this.currentJob && normalizeMac(this.currentJob.mac) === normalizeMac(this.mac);
    const activeElsewhere = jobIsActive(this.currentJob) && !activeForThis;
    const pending = this.pendingJob || (activeForThis && this.currentJob?.status === 'pending_confirm' ? this.currentJob : null);
    const canStart = !!pending && (!this.warnings.length || this.acceptedWarnings) && !this.busy;

    return html`
      <section class="ota">
        <div class="title-row">
          <div>
            <span>OTA</span>
            <h2>Firmware Flash</h2>
          </div>
          ${activeForThis && this.currentJob ? html`<button class="abort" ?disabled=${this.busy} @click=${this.abort}>Abort</button>` : nothing}
        </div>

        ${activeForThis && this.currentJob && this.currentJob.status !== 'pending_confirm'
          ? html`<esp-ota-progress .job=${this.currentJob}></esp-ota-progress>`
          : nothing}

        ${activeElsewhere
          ? html`<p class="notice">Another device has an active or pending OTA job. Finish or abort it before flashing this node.</p>`
          : html`
              <label class="upload ${this.busy ? 'busy' : ''}">
                <input type="file" accept=".bin,.ota.bin,application/octet-stream" ?disabled=${this.busy || !!pending} @change=${this.upload} />
                <strong>${this.busy ? 'Processing firmware...' : 'Choose .ota.bin firmware'}</strong>
                <small>Stored in the add-on, then chunk-fed to the bridge.</small>
              </label>
            `}

        ${pending ? this.renderPending(pending, canStart) : nothing}
        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
      </section>
    `;
  }

  private renderPending(job: OtaJob, canStart: boolean) {
    return html`
      <div class="pending">
        <h3>${job.firmware_name || 'Selected firmware'}</h3>
        <div class="compare">
          <div><span>Current</span><strong>${this.node.firmware_version || '-'}</strong></div>
          <div><span>New</span><strong>${job.parsed_version || '-'}</strong></div>
          <div><span>Project</span><strong>${job.parsed_project_name || '-'}</strong></div>
          <div><span>Chip</span><strong>${chipName(job.parsed_chip_type)}</strong></div>
          <div><span>Size</span><strong>${fmtBytes(job.firmware_size)}</strong></div>
          <div><span>MD5</span><strong>${job.firmware_md5 || '-'}</strong></div>
        </div>
        ${this.firmware ? html`<p class="meta">Parsed build: ${String(this.firmware.parsed_build_date || '-')}</p>` : nothing}
        ${this.warnings.length
          ? html`
              <div class="warnings">
                ${this.warnings.map((warning) => html`<p>${warning}</p>`)}
                <label>
                  <input type="checkbox" .checked=${this.acceptedWarnings} @change=${(event: Event) => (this.acceptedWarnings = (event.target as HTMLInputElement).checked)} />
                  Flash anyway
                </label>
              </div>
            `
          : nothing}
        <div class="actions">
          <button class="start" ?disabled=${!canStart} @click=${this.start}>Flash</button>
          <button ?disabled=${this.busy} @click=${this.abort}>Cancel</button>
        </div>
      </div>
    `;
  }

  static styles = css`
    .ota {
      display: grid;
      gap: 12px;
    }

    .title-row {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
    }

    .title-row span {
      color: var(--accent);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
    }

    h2,
    h3 {
      margin: 0;
    }

    h2 {
      font-size: 20px;
    }

    .upload {
      display: grid;
      gap: 6px;
      place-items: center;
      min-height: 130px;
      border: 2px dashed var(--ink);
      background: #fffaf0;
      cursor: pointer;
      padding: 18px;
      text-align: center;
    }

    .upload:hover {
      background: #f3fbfa;
      border-color: var(--accent);
    }

    input[type='file'] {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      opacity: 0;
      pointer-events: none;
    }

    small,
    .meta {
      color: var(--muted);
      font-size: 12px;
    }

    .pending {
      border: 2px solid var(--ink);
      background: white;
      padding: 12px;
    }

    .compare {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 12px 0;
    }

    .compare div {
      border: 1px solid var(--line);
      padding: 8px;
      min-width: 0;
    }

    .compare span {
      display: block;
      color: var(--muted);
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      margin-bottom: 5px;
    }

    .compare strong {
      display: block;
      overflow-wrap: anywhere;
      font-size: 12px;
    }

    .warnings {
      border-left: 5px solid var(--accent-2);
      background: #fff7df;
      padding: 10px;
      display: grid;
      gap: 8px;
      margin-bottom: 12px;
    }

    .warnings p {
      margin: 0;
      font-size: 12px;
    }

    .warnings label {
      font-weight: 900;
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    button {
      border: 2px solid var(--ink);
      background: var(--panel);
      color: var(--ink);
      min-height: 36px;
      padding: 0 14px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 3px 3px 0 var(--ink);
    }

    button.start {
      background: var(--accent);
      color: white;
    }

    button.abort {
      background: var(--danger);
      color: white;
    }

    button:disabled {
      opacity: 0.48;
      cursor: not-allowed;
      box-shadow: none;
    }

    .notice,
    .error {
      margin: 0;
      padding: 10px;
      border: 2px solid var(--accent-2);
      background: #fff7df;
      color: #7c3f00;
      font-weight: 800;
    }

    .error {
      border-color: var(--danger);
      background: #fff1ed;
      color: var(--danger);
    }

    @media (max-width: 760px) {
      .compare {
        grid-template-columns: 1fr;
      }
    }
  `;
}
