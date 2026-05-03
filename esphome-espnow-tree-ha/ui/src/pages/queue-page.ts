import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { OtaJob, QueueResponse, CompileQueueResponse, api, fmtBytes } from '../api/client';

@customElement('esp-queue-page')
export class EspQueuePage extends LitElement {
  @state() private queueData: QueueResponse | null = null;
  @state() private compileData: CompileQueueResponse | null = null;
  @state() private error = '';
  @state() private busyJob: number | null = null;
  @state() private busyAction = '';
  @state() private showAbortModal = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.fetchQueue();
    this.pollTimer = setInterval(() => this.fetchQueue(), 2000);
  }

  disconnectedCallback(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    super.disconnectedCallback();
  }

  private async fetchQueue(): Promise<void> {
    try {
      const [flash, compile] = await Promise.all([
        api.getQueue(),
        api.getCompileQueue(),
      ]);
      this.queueData = flash;
      this.compileData = compile;
    } catch {
      // ignore poll errors
    }
  }

  private async pauseQueue(): Promise<void> {
    this.busyAction = 'pause';
    this.error = '';
    try {
      await api.pauseQueue();
      await this.fetchQueue();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busyAction = '';
    }
  }

  private async resumeQueue(): Promise<void> {
    this.busyAction = 'resume';
    this.error = '';
    try {
      await api.resumeQueue();
      await this.fetchQueue();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busyAction = '';
    }
  }

  private async abortQueuedJob(jobId: number): Promise<void> {
    this.busyJob = jobId;
    this.error = '';
    try {
      await api.abortQueuedJob(jobId);
      await this.fetchQueue();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busyJob = null;
    }
  }

  private async abortCompileJob(jobId: number): Promise<void> {
    this.busyJob = jobId;
    this.error = '';
    try {
      await api.abortCompileJob(jobId);
      await this.fetchQueue();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busyJob = null;
    }
  }

  private async moveUp(jobId: number): Promise<void> {
    this.busyJob = jobId;
    this.error = '';
    try {
      await api.reorderJobUp(jobId);
      await this.fetchQueue();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busyJob = null;
    }
  }

  private async abortActiveJob(): Promise<void> {
    this.busyAction = 'abort-active';
    this.error = '';
    try {
      const queue = await api.getQueue();
      if (queue.count > 0) {
        this.showAbortModal = true;
        return;
      }
      await api.abortOta();
      await this.fetchQueue();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busyAction = '';
    }
  }

  private async abortActiveAndContinue(): Promise<void> {
    this.showAbortModal = false;
    try {
      await api.abortOta();
      await this.fetchQueue();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  private async abortActiveAndPause(): Promise<void> {
    this.showAbortModal = false;
    try {
      await api.abortOta();
      await api.pauseQueue();
      await this.fetchQueue();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  private navigateToDevice(mac: string): void {
    window.location.hash = `/device/${encodeURIComponent(mac)}`;
  }

  private async moveDown(jobId: number): Promise<void> {
    this.busyJob = jobId;
    this.error = '';
    try {
      await api.reorderJobDown(jobId);
      await this.fetchQueue();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busyJob = null;
    }
  }

  render() {
    const data = this.queueData;
    const hasActive = !!data?.active_job && !['success', 'failed', 'aborted', 'rejoin_timeout', 'version_mismatch'].includes(data.active_job.status);
    const queued = data?.queued_jobs ?? [];
    const paused = data?.paused ?? false;
    const totalCount = queued.length + (hasActive ? 1 : 0);

    const compileActive = this.compileData?.active_job ?? null;
    const compileQueued = this.compileData?.queued_jobs ?? [];
    const compileCount = this.compileData?.count ?? 0;

    return html`
      <section>
        <div class="title-row">
          <div>
            <span>Queue</span>
            <h2>Compile Queue</h2>
          </div>
        </div>

        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}

        ${compileCount === 0
          ? html`<p class="empty">No compiles in progress or queued.</p>`
          : nothing}

        ${compileActive ? this.renderCompileActiveRow(compileActive) : nothing}
        ${compileQueued.map((job, i) => this.renderCompileQueuedRow(job, i + 2))}
      </section>

      <section>
        <div class="title-row">
          <div>
            <span>Queue</span>
            <h2>Firmware Flash Queue</h2>
          </div>
          <div class="controls">
            ${paused
              ? html`<button class="btn btn-resume" ?disabled=${this.busyAction === 'resume'} @click=${this.resumeQueue}>▶ Resume</button>`
              : html`<button class="btn btn-pause" ?disabled=${this.busyAction === 'pause'} @click=${this.pauseQueue}>⏸ Pause</button>`
            }
            ${paused ? html`<span class="pause-badge">PAUSED</span>` : nothing}
          </div>
        </div>

        ${totalCount === 0 && !hasActive
          ? html`<p class="empty">No firmware flashes in progress or queued.</p>`
          : nothing}

        ${hasActive || queued.length > 0
          ? html`
              <div class="table">
                ${hasActive && data!.active_job
                  ? this.renderActiveRow(data!.active_job)
                  : nothing}
                ${queued.map((job, i) => this.renderQueuedRow(job, i + 2, queued.length))}
              </div>
            `
          : nothing}
      </section>

      ${this.showAbortModal ? this.renderAbortModal() : nothing}
    `;
  }

  private renderCompileActiveRow(job: OtaJob) {
    const label = (job as unknown as Record<string, unknown>).device_label || (job as unknown as Record<string, unknown>).esphome_name || job.mac;
    return html`
      <article class="compile-active-row">
        <div class="device-info clickable" @click=${() => this.navigateToDevice(job.mac)}>
          <strong>&#9881; ${label}</strong>
          <small>Compiling...</small>
        </div>
        <div class="progress-cell">
          <small>COMPILING</small>
        </div>
        <div class="actions">
          <button class="btn btn-abort" ?disabled=${this.busyJob === job.id} @click=${() => this.abortCompileJob(job.id)}>Abort</button>
        </div>
      </article>
    `;
  }

  private renderCompileQueuedRow(job: OtaJob, position: number) {
    const isBusy = this.busyJob === job.id;
    const label = (job as unknown as Record<string, unknown>).device_label || (job as unknown as Record<string, unknown>).esphome_name || job.mac;
    return html`
      <article class="compile-queued-row">
        <div class="device-info clickable" @click=${() => this.navigateToDevice(job.mac)}>
          <strong>${position}. ${label}</strong>
          <small>Waiting to compile</small>
        </div>
        <div class="progress-cell">
          <small>QUEUED</small>
        </div>
        <div class="actions">
          <button ?disabled=${isBusy} @click=${() => this.abortCompileJob(job.id)}>&#10005;</button>
        </div>
      </article>
    `;
  }

  private renderAbortModal() {
    return html`
      <div class="modal-backdrop" @click=${() => { this.showAbortModal = false; }}>
        <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
          <h3>Other queued jobs waiting</h3>
          <p>Continue running the next queued job after aborting this one?</p>
          <div class="modal-actions">
            <button class="continue" @click=${this.abortActiveAndContinue}>Yes, continue queue</button>
            <button class="btn btn-abort" @click=${this.abortActiveAndPause}>No, pause queue</button>
            <button @click=${() => { this.showAbortModal = false; }}>Cancel</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderActiveRow(job: OtaJob) {
    const statusText = (job.bridge_state || job.status).replaceAll('_', ' ');
    const percent = job.percent ?? 0;
    const label = job.device_label || job.mac;
    return html`
      <article class="active-row">
        <div class="device-info clickable" @click=${() => this.navigateToDevice(job.mac)}>
          <strong>① ${label}</strong>
          <small>${job.firmware_name || 'firmware.ota.bin'}</small>
        </div>
        <div class="progress-cell">
          <div class="progress-wrap"><div class="progress-fill" style="width: ${percent}%"></div></div>
          <small>${statusText} · ${percent}%</small>
        </div>
        <div class="actions">
          <button class="btn btn-abort" ?disabled=${this.busyAction === 'abort-active'} @click=${this.abortActiveJob}>Abort</button>
        </div>
      </article>
    `;
  }

  private renderQueuedRow(job: OtaJob, position: number, total: number) {
    const isBusy = this.busyJob === job.id;
    const label = job.device_label || job.mac;
    return html`
      <article class="queued-row">
        <div class="device-info clickable" @click=${() => this.navigateToDevice(job.mac)}>
          <strong>${position}. ${label}</strong>
          <small>${job.firmware_name || 'firmware.ota.bin'} · ${fmtBytes(job.firmware_size)}</small>
        </div>
        <div class="progress-cell">
          <div class="progress-wrap queued"><div class="progress-fill queued" style="width: 0%"></div></div>
          <small>Queued</small>
        </div>
        <div class="actions">
          <button ?disabled=${isBusy} @click=${() => this.abortQueuedJob(job.id)}>✕</button>
          ${position > 2 ? html`<button ?disabled=${isBusy} @click=${() => this.moveUp(job.id)}>▲</button>` : nothing}
          ${position < total + 1 ? html`<button ?disabled=${isBusy} @click=${() => this.moveDown(job.id)}>▼</button>` : nothing}
        </div>
      </article>
    `;
  }

static styles = css`
    section {
      display: grid;
      gap: 16px;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 16px 20px;
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }

    .title-row span {
      color: var(--primary);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .title-row h2 {
      margin: 2px 0 0;
      font-size: 16px;
      font-weight: 600;
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pause-badge {
      background: var(--accent);
      color: #fff;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      border-radius: 20px;
    }

    .table {
      display: grid;
      gap: 8px;
    }

    article {
      display: grid;
      grid-template-columns: 1.5fr 1fr auto;
      gap: 12px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px 16px;
      background: var(--surface);
    }

    .active-row {
      background: #f0f9ff;
      border-color: #bae6fd;
    }

    .compile-active-row {
      background: #f0f9ff;
      border-color: var(--primary);
    }

    .queued-row {
      background: #fffbeb;
      border-color: #fde68a;
    }

    .compile-queued-row {
      background: #fffbeb;
      border-color: var(--accent);
    }

    .device-info strong {
      display: block;
      overflow-wrap: anywhere;
      font-size: 14px;
      font-weight: 600;
    }

    .device-info.clickable {
      cursor: pointer;
    }

    .device-info.clickable:hover strong {
      text-decoration: underline;
    }

    .device-info small {
      color: var(--muted);
      font-size: 12px;
    }

    .progress-cell {
      display: grid;
      gap: 4px;
    }

    .progress-wrap {
      width: 100%;
      height: 8px;
      background: var(--line);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--primary);
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .progress-fill.queued {
      background: var(--accent);
    }

    .progress-cell small {
      color: var(--muted);
      font-size: 11px;
    }

    .actions {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
      min-height: 32px;
    }

    .btn:hover {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .btn-pause {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    .btn-pause:hover {
      background: #e68a00;
    }

    .btn-resume {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .btn-resume:hover {
      background: #0d4d5e;
    }

    .btn-abort {
      background: var(--danger);
      color: #fff;
      border-color: var(--danger);
    }

    .btn-abort:hover {
      background: #dc2626;
    }

    button:disabled,
    .btn:disabled {
      opacity: 0.48;
      cursor: not-allowed;
    }

    .empty,
    .error {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }

    .error {
      color: var(--danger);
      font-weight: 500;
      padding: 12px;
      border: 1px solid var(--danger);
      background: #fef2f2;
      border-radius: 8px;
    }

    @media (max-width: 720px) {
      article {
        grid-template-columns: 1fr;
        align-items: stretch;
      }
      .actions {
        justify-content: flex-start;
      }
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 20px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .modal h3 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
    }

    .modal p {
      margin: 0 0 16px 0;
      font-size: 14px;
      color: var(--muted);
    }

    .modal-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'esp-queue-page': EspQueuePage;
  }
}