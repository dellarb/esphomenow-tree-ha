import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { OtaJob, QueueResponse, api, fmtBytes } from '../api/client';

@customElement('esp-queue-page')
export class EspQueuePage extends LitElement {
  @state() private queueData: QueueResponse | null = null;
  @state() private error = '';
  @state() private busyJob: number | null = null;
  @state() private busyAction = '';
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
      this.queueData = await api.getQueue();
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

    return html`
      <section>
        <div class="title-row">
          <div>
            <span>Queue</span>
            <h2>Firmware Queue</h2>
          </div>
          <div class="controls">
            ${paused
              ? html`<button class="resume" ?disabled=${this.busyAction === 'resume'} @click=${this.resumeQueue}>▶ Resume</button>`
              : html`<button class="pause" ?disabled=${this.busyAction === 'pause'} @click=${this.pauseQueue}>⏸ Pause</button>`
            }
            ${paused ? html`<span class="pause-badge">PAUSED</span>` : nothing}
          </div>
        </div>

        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}

        ${totalCount === 0 && !hasActive
          ? html`<p class="empty">No firmware flashes in progress or queued.</p>`
          : nothing}

        ${hasActive || queued.length > 0
          ? html`
              <div class="table">
                ${hasActive && data!.active_job
                  ? this.renderActiveRow(data!.active_job)
                  : nothing}
                ${queued.map((job, i) => this.renderQueuedRow(job, i + 1, queued.length))}
              </div>
            `
          : nothing}
      </section>
    `;
  }

  private renderActiveRow(job: OtaJob) {
    const statusText = (job.bridge_state || job.status).replaceAll('_', ' ');
    const percent = job.percent ?? 0;
    return html`
      <article class="active-row">
        <div class="device-info">
          <strong>① In Progress</strong>
          <small>${job.firmware_name || 'firmware.ota.bin'}</small>
        </div>
        <div class="progress-cell">
          <div class="progress-bar"><div class="progress-fill" style="width: ${percent}%"></div></div>
          <small>${statusText} · ${percent}%</small>
        </div>
        <div class="actions">
          <span class="status-badge active">ACTIVE</span>
        </div>
      </article>
    `;
  }

  private renderQueuedRow(job: OtaJob, position: number, total: number) {
    const isBusy = this.busyJob === job.id;
    const label = job.device_label || job.mac;
    return html`
      <article class="queued-row">
        <div class="device-info">
          <strong>${position}. ${label}</strong>
          <small>${job.firmware_name || 'firmware.ota.bin'} · ${fmtBytes(job.firmware_size)}</small>
        </div>
        <div class="progress-cell">
          <div class="progress-bar queued"><div class="progress-fill queued" style="width: 0%"></div></div>
          <small>Queued</small>
        </div>
        <div class="actions">
          <button ?disabled=${isBusy} @click=${() => this.abortQueuedJob(job.id)}>✕</button>
          ${position > 1 ? html`<button ?disabled=${isBusy} @click=${() => this.moveUp(job.id)}>▲</button>` : nothing}
          ${position < total ? html`<button ?disabled=${isBusy} @click=${() => this.moveDown(job.id)}>▼</button>` : nothing}
        </div>
      </article>
    `;
  }

  static styles = css`
    section {
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

    h2 {
      margin: 0;
      font-size: 20px;
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pause-badge {
      background: var(--accent-2);
      color: white;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      border: 2px solid var(--ink);
      box-shadow: 2px 2px 0 var(--ink);
    }

    .table {
      display: grid;
      gap: 6px;
    }

    article {
      display: grid;
      grid-template-columns: minmax(140px, 1.5fr) minmax(140px, 1fr) auto;
      gap: 10px;
      align-items: center;
      border: 2px solid var(--ink);
      padding: 10px;
      background: white;
    }

    .active-row {
      background: #f3fbfa;
    }

    .queued-row {
      background: #fff7df;
    }

    .device-info strong {
      display: block;
      overflow-wrap: anywhere;
    }

    .device-info small {
      color: var(--muted);
      font-size: 11px;
    }

    .progress-cell {
      display: grid;
      gap: 4px;
    }

    .progress-bar {
      width: 100%;
      height: 8px;
      background: #e0e0e0;
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-bar.queued {
      height: 6px;
    }

    .progress-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .progress-fill.queued {
      background: var(--accent-2);
    }

    .progress-cell small {
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
    }

    .actions {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    .status-badge {
      border: 2px solid var(--ink);
      padding: 4px 8px;
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
    }

    .status-badge.active {
      background: var(--accent);
      color: white;
    }

    button {
      border: 2px solid var(--ink);
      background: var(--panel);
      color: var(--ink);
      min-height: 32px;
      padding: 0 10px;
      font: inherit;
      font-weight: 900;
      font-size: 12px;
      cursor: pointer;
      box-shadow: 2px 2px 0 var(--ink);
    }

    button:hover {
      background: var(--accent);
      color: white;
    }

    button.pause {
      background: var(--accent-2);
      color: white;
    }

    button.resume {
      background: var(--accent);
      color: white;
    }

    button:disabled {
      opacity: 0.48;
      cursor: not-allowed;
      box-shadow: none;
    }

    .empty,
    .error {
      margin: 0;
      color: var(--muted);
    }

    .error {
      color: var(--danger);
      font-weight: 900;
      padding: 10px;
      border: 2px solid var(--danger);
      background: #fff1ed;
    }

    @media (max-width: 720px) {
      article {
        grid-template-columns: 1fr;
        align-items: stretch;
      }
      .actions {
        justify-content: start;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'esp-queue-page': EspQueuePage;
  }
}