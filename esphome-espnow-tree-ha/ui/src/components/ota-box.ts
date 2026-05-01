import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { OtaJob, PreflightComparison, TopologyNode, api, fmtBytes, fmtTime, jobIsActive, normalizeMac } from '../api/client';
import './ota-progress';

const TERMINAL_STATUSES = new Set(['success', 'failed', 'aborted', 'rejoin_timeout', 'version_mismatch']);

@customElement('esp-ota-box')
export class EspOtaBox extends LitElement {
  @property({ type: String }) mac = '';
  @property({ type: Object }) node!: TopologyNode;
  @property({ type: Object }) currentJob: OtaJob | null = null;
  @state() private pendingJob: OtaJob | null = null;
  @state() private preflight: PreflightComparison | null = null;
  @state() private acceptedWarnings = false;
  @state() private busy = false;
  @state() private error = '';
  @state() private completedJob: OtaJob | null = null;
  private abortedJobId: number | null = null;

  willUpdate(changedProperties: Map<string, unknown>): void {
    if (changedProperties.has('currentJob')) {
      const prevJob = changedProperties.get('currentJob') as OtaJob | null;
      if (prevJob && TERMINAL_STATUSES.has(prevJob.status) && !this.completedJob) {
        this.completedJob = prevJob;
      }
      if (prevJob && prevJob.status === 'pending_confirm' && prevJob.id !== this.abortedJobId) {
        this.pendingJob = prevJob;
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
      this.preflight = result.preflight || null;
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
      this.preflight = null;
      this.dispatchChanged();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
    }
  }

  private async abort(): Promise<void> {
    this.abortedJobId = this.pendingJob?.id ?? this.currentJob?.id ?? null;
    this.pendingJob = null;
    this.preflight = null;
    this.acceptedWarnings = false;
    this.busy = true;
    this.error = '';
    try {
      await api.abortOta();
      this.dispatchChanged();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
    }
  }

  private async dismissAndClear(): Promise<void> {
    this.completedJob = null;
    this.pendingJob = null;
    this.preflight = null;
    this.acceptedWarnings = false;
    this.dispatchChanged();
  }

  private dispatchChanged(): void {
    this.dispatchEvent(new CustomEvent('ota-changed', { bubbles: true, composed: true }));
  }

  render() {
    const activeForThis = this.currentJob && normalizeMac(this.currentJob.mac) === normalizeMac(this.mac);
    const activeElsewhere = jobIsActive(this.currentJob) && !activeForThis;
    const pending = this.pendingJob || (activeForThis && this.currentJob?.status === 'pending_confirm' ? this.currentJob : null);
    const canStart = !!pending && (!this.preflight?.has_warnings || this.acceptedWarnings) && !this.busy;
    const showResult = this.completedJob && TERMINAL_STATUSES.has(this.completedJob.status);

    return html`
      <section class="ota">
        <div class="title-row">
          <div>
            <span>OTA</span>
            <h2>Firmware Flash</h2>
          </div>
          ${activeForThis && this.currentJob && !showResult ? html`<button class="abort" ?disabled=${this.busy} @click=${this.abort}>Abort</button>` : nothing}
        </div>

        ${showResult
          ? this.renderFlashResult(this.completedJob!)
          : html`
              ${activeForThis && this.currentJob && this.currentJob.status !== 'pending_confirm'
                ? html`<esp-ota-progress .job=${this.currentJob}></esp-ota-progress>`
                : nothing}

              ${activeElsewhere
                ? html`<p class="notice">Another device has an active or pending OTA job. Finish or abort it before flashing this node.</p>`
                : !pending && !activeForThis
                  ? html`
                      <label class="upload ${this.busy ? 'busy' : ''}">
                        <input type="file" accept=".bin,.ota.bin,application/octet-stream" ?disabled=${this.busy || !!pending} @change=${this.upload} />
                        <strong>${this.busy ? 'Processing firmware...' : 'Choose .ota.bin firmware'}</strong>
                        <small>Stored in the add-on, then chunk-fed to the bridge.</small>
                      </label>
                    `
                  : nothing}

              ${pending && !(activeForThis && this.currentJob && this.currentJob.status !== 'pending_confirm') ? this.renderPending(pending, canStart) : nothing}
            `}
        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
      </section>
    `;
  }

  private renderPending(job: OtaJob, canStart: boolean) {
    const p = this.preflight;
    const nameBadge = p?.name.match ? 'match' : 'mismatch';
    const nameBadgeClass = `ver-badge ${nameBadge}`;
    const nameBadgeText = p?.name.match ? 'MATCH' : 'MISMATCH';

    const chipBadge = p?.chip.match ? 'match' : 'mismatch';
    const chipBadgeClass = `ver-badge ${chipBadge}`;
    const chipBadgeText = p?.chip.match ? 'MATCH' : 'MISMATCH';

    const dateStatus = p?.build_date.status || 'unknown';
    let dateBadgeClass = 'ver-badge ';
    let dateBadgeText = '';
    if (dateStatus === 'same') {
      dateBadgeClass += 'same';
      dateBadgeText = 'SAME';
    } else if (dateStatus === 'newer') {
      dateBadgeClass += 'newer';
      dateBadgeText = `NEWER ${p?.build_date.delta}`;
    } else if (dateStatus === 'older') {
      dateBadgeClass += 'older';
      dateBadgeText = `OLDER ${p?.build_date.delta}`;
    }

    return html`
      <div class="pending">
        <h3>${job.firmware_name || 'Selected firmware'}</h3>
        <table class="compare-table">
          <thead>
            <tr><th>Field</th><th>Current (Remote)</th><th>New (Firmware)</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Name</td>
              <td>${p?.name.current || '-'}</td>
              <td>${p?.name.new || '-'}<br><span class="${nameBadgeClass}">${nameBadgeText}</span></td>
            </tr>
            <tr>
              <td>Build Date</td>
              <td>${p?.build_date.current || '-'}</td>
              <td>${p?.build_date.new || '-'}<br><span class="${dateBadgeClass}">${dateBadgeText}</span></td>
            </tr>
            <tr>
              <td>Chip Type</td>
              <td>${p?.chip.current || '-'}</td>
              <td>${p?.chip.new || '-'}<br><span class="${chipBadgeClass}">${chipBadgeText}</span></td>
            </tr>
          </tbody>
        </table>
        <div class="meta-info">
          <span>Size: ${fmtBytes(job.firmware_size)}</span>
          <span>MD5: ${job.firmware_md5 || '-'}</span>
        </div>
        ${p?.has_warnings
          ? html`
              <div class="warnings">
                ${p.warnings.map((warning) => html`<p>${warning}</p>`)}
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

  private renderFlashResult(job: OtaJob) {
    const isSuccess = job.status === 'success';
    const resultClass = isSuccess ? 'success' : 'failure';
    const resultLabel = isSuccess ? 'FLASH SUCCESSFUL' : job.status.replaceAll('_', ' ').toUpperCase();

    const jobName = job.parsed_esphome_name || job.firmware_name || '-';
    const nodeName = this.node.esphome_name || '-';
    const nameMatch = jobName === nodeName || (jobName === '-' && nodeName === '-');

    const jobDate = job.parsed_build_date || '-';
    const nodeDate = this.node.firmware_build_date || '-';
    const dateMatch = jobDate === nodeDate || (jobDate === '-' && nodeDate === '-');

    const jobChip = job.parsed_chip_name || '-';
    const nodeChip = this.node.chip_name || '-';
    const chipMatch = jobChip === nodeChip || (jobChip === '-' && nodeChip === '-');

    return html`
      <div class="flash-result ${resultClass}">
        <div class="result-banner">
          <span class="result-icon">${isSuccess ? '✓' : '✗'}</span>
          <span class="result-label">${resultLabel}</span>
        </div>
        <h3>${job.firmware_name || 'firmware.ota.bin'}</h3>
        <table class="compare-table">
          <thead>
            <tr><th>Field</th><th>Flashed</th><th>Device Now</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Name</td>
              <td>${jobName}</td>
              <td>${nodeName} ${!nameMatch ? html`<span class="ver-badge mismatch">CHANGED</span>` : nothing}</td>
            </tr>
            <tr>
              <td>Build Date</td>
              <td>${jobDate}</td>
              <td>${nodeDate} ${!dateMatch ? html`<span class="ver-badge mismatch">CHANGED</span>` : nothing}</td>
            </tr>
            <tr>
              <td>Chip Type</td>
              <td>${jobChip}</td>
              <td>${nodeChip} ${!chipMatch ? html`<span class="ver-badge mismatch">CHANGED</span>` : nothing}</td>
            </tr>
          </tbody>
        </table>
        <div class="meta-info">
          <span>Size: ${fmtBytes(job.firmware_size)}</span>
          ${job.completed_at ? html`<span>Completed: ${fmtTime(job.completed_at)}</span>` : nothing}
        </div>
        <div class="actions">
          <button @click=${this.dismissAndClear}>Clear Result</button>
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

    .compare-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 12px;
    }

    .compare-table th,
    .compare-table td {
      border: 1px solid var(--line);
      padding: 8px;
      text-align: left;
    }

    .compare-table th {
      background: var(--panel);
      font-weight: 900;
      text-transform: uppercase;
      font-size: 10px;
      color: var(--muted);
    }

    .compare-table td:first-child {
      font-weight: 700;
      color: var(--muted);
    }

    .ver-badge {
      display: inline-block;
      padding: 0.2em 0.6em;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: 600;
      margin-top: 0.3em;
    }

    .ver-badge.match {
      background: rgba(0, 230, 118, 0.2);
      color: #00a854;
    }

    .ver-badge.same {
      background: rgba(136, 136, 136, 0.2);
      color: #888;
    }

    .ver-badge.mismatch,
    .ver-badge.newer {
      background: rgba(255, 82, 82, 0.2);
      color: #e53935;
    }

    .ver-badge.older {
      background: rgba(0, 230, 118, 0.2);
      color: #00a854;
    }

    .meta-info {
      display: flex;
      gap: 16px;
      font-size: 11px;
      color: var(--muted);
      margin-bottom: 12px;
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

    .flash-result {
      border: 2px solid var(--ink);
      background: white;
      padding: 12px;
    }

    .flash-result.failure {
      border-color: var(--danger);
    }

    .result-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      margin: -12px -12px 12px -12px;
      font-weight: 900;
      text-transform: uppercase;
      font-size: 14px;
    }

    .flash-result.success .result-banner {
      background: #dff8e8;
      color: var(--ok);
    }

    .flash-result.failure .result-banner {
      background: #fff1ed;
      color: var(--danger);
    }

    .result-icon {
      font-size: 18px;
      line-height: 1;
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
      .compare-table {
        font-size: 11px;
      }
    }
  `;
}
