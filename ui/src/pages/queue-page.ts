import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { OtaJob, QueueResponse, CompileQueueResponse, api, fmtBytes, fmtTime, fmtDuration, fmtTimeAgo } from '../api/client';

interface HistoryDisplayEntry {
  type: 'flash' | 'compile' | 'combined';
  compileJob?: OtaJob;
  flashJob?: OtaJob;
  job?: OtaJob;
  label: string;
  status: string;
  statusLabel: string;
  created_at: number;
}

const COMBINE_WINDOW_S = 300;
const FLASH_RESULT_STATUSES = new Set(['success', 'failed', 'aborted', 'rejoin_timeout', 'version_mismatch']);

@customElement('esp-queue-page')
export class EspQueuePage extends LitElement {
  @state() private queueData: QueueResponse | null = null;
  @state() private compileData: CompileQueueResponse | null = null;
  @state() private historyJobs: OtaJob[] = [];
  @state() private error = '';
  @state() private busyJob: number | null = null;
  @state() private busyAction = '';
  @state() private showAbortModal = false;
  @state() private historyFilter: 'all' | 'flash' | 'compile' = 'all';
  @state() private historyLimit = 10;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private historyTimer: ReturnType<typeof setInterval> | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.fetchQueue();
    this.pollTimer = setInterval(() => this.fetchQueue(), 2000);
    this.fetchHistory();
    this.historyTimer = setInterval(() => this.fetchHistory(), 5000);
  }

  disconnectedCallback(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.historyTimer) { clearInterval(this.historyTimer); this.historyTimer = null; }
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

  private async fetchHistory(): Promise<void> {
    try {
      const resp = await api.getAllHistory(100);
      this.historyJobs = resp.jobs;
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

  private navigateToJob(job: OtaJob): void {
    window.location.hash = `/job/${job.id}?from=${encodeURIComponent('/queue')}`;
  }

  private labelFor(job: OtaJob): string {
    return job.device_label || job.parsed_esphome_name || job.esphome_name || job.mac;
  }

  private buildDisplayEntries(): HistoryDisplayEntry[] {
    const filtered = this.historyJobs.filter(j => {
      if (this.historyFilter === 'all') return true;
      return (j.job_type || this.inferJobType(j)) === this.historyFilter;
    });

    const sorted = [...filtered].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
    const result: HistoryDisplayEntry[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const curType: 'flash' | 'compile' = (current.job_type || this.inferJobType(current)) as 'flash' | 'compile';

      if (next && curType === 'compile' && (next.job_type || this.inferJobType(next)) === 'flash'
          && current.mac === next.mac
          && (next.created_at - current.created_at) <= COMBINE_WINDOW_S) {
        const status = next.status === 'success' && current.status === 'compile_success' ? 'success' : 'failed';
        result.push({
          type: 'combined',
          compileJob: current,
          flashJob: next,
          label: this.labelFor(current),
          status,
          statusLabel: status === 'success' ? 'Success' : 'Failed',
          created_at: next.created_at,
        });
        i++;
      } else {
        result.push({
          type: curType,
          job: current,
          label: this.labelFor(current),
          status: current.status,
          statusLabel: current.status === 'success' && curType === 'flash'
            ? 'OTA Upload Success'
            : current.status.replaceAll('_', ' '),
          created_at: current.created_at,
        });
      }
    }

    result.sort((a, b) => b.created_at - a.created_at);
    return result;
  }

  private inferJobType(job: OtaJob): 'flash' | 'compile' {
    if (job.status === 'compile_success' || job.status === 'compile_queued' || job.status === 'compiling') return 'compile';
    if (FLASH_RESULT_STATUSES.has(job.status)) return 'flash';
    return 'flash';
  }

  private get statusStyles(): Record<string, string> {
    return {
      'success': `background:#dcfce7;color:#15803d;`,
      'failed': `background:#fef2f2;color:#dc2626;`,
      'aborted': `background:#fef3c7;color:#b45309;`,
      'rejoin_timeout': `background:#fef3c7;color:#b45309;`,
      'version_mismatch': `background:#fef3c7;color:#b45309;`,
      'compile_success': `background:#dcfce7;color:#15803d;`,
    };
  }

  render() {
    const data = this.queueData;
    const hasActive = !!data?.active_job && !FLASH_RESULT_STATUSES.has(data.active_job.status);
    const queued = data?.queued_jobs ?? [];
    const paused = data?.paused ?? false;
    const totalCount = queued.length + (hasActive ? 1 : 0);

    const compileActive = this.compileData?.active_job ?? null;
    const compileQueued = this.compileData?.queued_jobs ?? [];
    const compileCount = this.compileData?.count ?? 0;

    const displayEntries = this.buildDisplayEntries();
    const shownEntries = displayEntries.slice(0, this.historyLimit);
    const totalHistory = displayEntries.length;

    return html`
      <div class="queue-page">
        <div class="queue-toolbar">
          <div class="toolbar-actions">
            ${paused
              ? html`<button class="btn btn-resume" ?disabled=${this.busyAction === 'resume'} @click=${this.resumeQueue}>▶ Resume</button>`
              : html`<button class="btn btn-pause" ?disabled=${this.busyAction === 'pause'} @click=${this.pauseQueue}>⏸ Pause</button>`
            }
            ${paused ? html`<span class="pause-badge">PAUSED</span>` : nothing}
          </div>
        </div>

        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}

        <!-- Compile Queue -->
        <div class="section-card">
          <div class="title-row">
            <h2>Compile Queue</h2>
          </div>
          <div class="section-content">
            ${compileCount === 0
              ? html`<p class="empty">No compiles in progress or queued.</p>`
              : nothing}

            ${compileActive ? this.renderCompileRow(compileActive, true) : nothing}
            ${compileQueued.map(job => this.renderCompileRow(job, false))}
          </div>
        </div>

        <!-- OTA Upload Queue -->
        <div class="section-card">
          <div class="title-row">
            <h2>OTA Upload Queue ${totalCount > 0 ? html`<span class="subtitle">${totalCount} job${totalCount !== 1 ? 's' : ''}</span>` : ''}</h2>
          </div>
          <div class="section-content">
            ${totalCount === 0 && !hasActive
              ? html`<p class="empty">No firmware flashes in progress or queued.</p>`
              : nothing}

            ${hasActive || queued.length > 0
              ? html`
                  <div class="table">
                    ${hasActive && data!.active_job
                      ? this.renderOtaRow(data!.active_job, 1, queued.length + 1, true)
                      : nothing}
                    ${queued.map((job, i) => this.renderOtaRow(job, i + (hasActive ? 2 : 1), queued.length + (hasActive ? 1 : 0), false))}
                  </div>
                `
              : nothing}
          </div>
        </div>

        <!-- Job History -->
        <div class="section-card">
          <div class="title-row">
            <h2>Job History <span class="subtitle">${this.historyJobs.length} total</span></h2>
          </div>
          <div class="section-content">
            <div class="history-tabs">
              <button class="history-tab ${this.historyFilter === 'all' ? 'active' : ''}" @click=${() => { this.historyFilter = 'all'; this.historyLimit = 10; }}>All</button>
              <button class="history-tab ${this.historyFilter === 'flash' ? 'active' : ''}" @click=${() => { this.historyFilter = 'flash'; this.historyLimit = 10; }}>Flash</button>
              <button class="history-tab ${this.historyFilter === 'compile' ? 'active' : ''}" @click=${() => { this.historyFilter = 'compile'; this.historyLimit = 10; }}>Compile</button>
            </div>

            ${totalHistory === 0
              ? html`<p class="empty">No job history yet.</p>`
              : html`
                  <div class="table history-table">
                    ${shownEntries.map(entry => {
                      if (entry.type === 'combined') return this.renderCombinedRow(entry);
                      return this.renderHistoryRow(entry);
                    })}
                  </div>
                  ${totalHistory > this.historyLimit
                    ? html`<div class="show-more"><button @click=${() => { this.historyLimit += 10; }}>Show more (${totalHistory - this.historyLimit} older entries)</button></div>`
                    : nothing}
                `}
          </div>
        </div>

        ${this.showAbortModal ? this.renderAbortModal() : nothing}
      </div>
    `;
  }

  private renderCompileRow(job: OtaJob, isActive: boolean) {
    const isBusy = this.busyJob === job.id;
    const label = this.labelFor(job);
    return html`
      <article class="${isActive ? 'compile-active-row' : 'compile-queued-row'}">
        <div class="device-info clickable" @click=${() => this.navigateToDevice(job.mac)}>
          <strong>${isActive ? '⚙' : ''} ${label}</strong>
          <small>${isActive ? 'Compiling...' : 'Queued to compile'}</small>
        </div>
        <div class="progress-cell">
          <span class="status-pill ${isActive ? 'compiling' : 'queued'}">${isActive ? 'Compiling' : 'Queued'}</span>
        </div>
        <div class="actions">
          <button class="btn" @click=${() => this.navigateToJob(job)}>View log</button>
          <button class="btn btn-abort" ?disabled=${isBusy} @click=${() => this.abortCompileJob(job.id)}>Abort</button>
          <button class="btn btn-icon" disabled title="Move up">▲</button>
          <button class="btn btn-icon" disabled title="Move down">▼</button>
        </div>
      </article>
    `;
  }

  private renderOtaRow(job: OtaJob, position: number, total: number, isActive: boolean) {
    const isBusy = this.busyJob === job.id;
    const label = this.labelFor(job);
    if (isActive) {
      const statusText = (job.bridge_state || job.status).replaceAll('_', ' ');
      const percent = job.percent ?? 0;
      return html`
        <article class="active-row">
          <div class="device-info clickable" @click=${() => this.navigateToDevice(job.mac)}>
            <strong>① ${label}</strong>
            <small>${job.firmware_name || 'firmware.ota.bin'}</small>
          </div>
          <div class="progress-cell">
            <div class="progress-wrap"><div class="progress-fill" style="width: ${percent}%"></div></div>
            <span class="status-pill flashing">${statusText}</span> <span class="percent">${percent}%</span>
          </div>
          <div class="actions">
            <button class="btn" @click=${() => this.navigateToJob(job)}>View log</button>
            <button class="btn btn-abort" ?disabled=${this.busyAction === 'abort-active'} @click=${this.abortActiveJob}>Abort</button>
            <button class="btn btn-icon" disabled title="Move up">▲</button>
            <button class="btn btn-icon" disabled title="Move down">▼</button>
          </div>
        </article>
      `;
    }
    return html`
      <article class="queued-row">
        <div class="device-info clickable" @click=${() => this.navigateToDevice(job.mac)}>
          <strong><span class="position-num">${position}.</span> ${label}</strong>
          <small>${job.firmware_name || 'firmware.ota.bin'}${job.firmware_size ? html` · ${fmtBytes(job.firmware_size)}` : nothing}</small>
        </div>
        <div class="progress-cell">
          <div class="progress-wrap queued"><div class="progress-fill queued" style="width: 0%"></div></div>
          <span class="status-pill queued">Queued</span>
        </div>
        <div class="actions">
          <button class="btn" @click=${() => this.navigateToJob(job)}>View log</button>
          <button class="btn btn-abort" ?disabled=${isBusy} @click=${() => this.abortQueuedJob(job.id)}>Abort</button>
          <button class="btn btn-icon" ?disabled=${isBusy || position <= 2} @click=${() => this.moveUp(job.id)}>▲</button>
          <button class="btn btn-icon" ?disabled=${isBusy || position >= total} @click=${() => this.moveDown(job.id)}>▼</button>
        </div>
      </article>
    `;
  }

  private renderHistoryRow(entry: HistoryDisplayEntry) {
    const job = entry.job!;
    const style = this.statusStyles[entry.status] || '';
    const duration = job.completed_at && job.started_at ? fmtDuration(job.completed_at - job.started_at) : '';
    return html`
      <div class="history-row">
        <span class="type-badge type-${entry.type}">${entry.type.toUpperCase()}</span>
        <span class="device-label clickable" @click=${() => this.navigateToDevice(job.mac)}>${entry.label}</span>
        <span class="device-meta">${job.parsed_version ? `v${job.parsed_version}` : job.firmware_name || ''}</span>
        <span class="status-pill history-status" style=${style}>${entry.statusLabel}</span>
        <span class="timestamp" title=${fmtTime(job.created_at)}>${fmtTimeAgo(job.created_at)}</span>
        <span class="duration">${duration}</span>
        <button class="btn btn-sm" @click=${() => this.navigateToJob(job)}>View log</button>
      </div>
    `;
  }

  private renderCombinedRow(entry: HistoryDisplayEntry) {
    const compile = entry.compileJob!;
    const flash = entry.flashJob!;
    const durC = compile.completed_at && compile.started_at ? fmtDuration(compile.completed_at - compile.started_at) : '';
    const durF = flash.completed_at && flash.started_at ? fmtDuration(flash.completed_at - flash.started_at) : '';
    const style = this.statusStyles[entry.status] || '';
    return html`
      <div class="history-row combined-row" style="border-left: 3px solid ${entry.status === 'success' ? '#15803d' : '#dc2626'}">
        <span class="type-badge type-combined">
          <span class="c-compile">COMPILE</span><span class="c-flash">FLASH</span>
        </span>
        <span class="device-label clickable" @click=${() => this.navigateToDevice(compile.mac)}>${entry.label}</span>
        <span class="device-meta">${compile.parsed_version ? `v${compile.parsed_version}` : ''} → OTA upload · ${durC} + ${durF}</span>
        <span class="status-pill history-status" style=${style}>${entry.statusLabel}</span>
        <span class="timestamp" title=${fmtTime(flash.created_at)}>${fmtTimeAgo(flash.created_at)}</span>
        <span class="duration">${durF}</span>
        <button class="btn btn-sm" @click=${() => this.navigateToJob(flash)}>View log</button>
      </div>
    `;
  }

  private renderAbortModal() {
    return html`
      <div class="modal-backdrop" @click=${() => { this.showAbortModal = false; }}>
        <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
          <h3>Other queued jobs waiting</h3>
          <p>Continue running the next queued job after aborting this one?</p>
          <div class="modal-actions">
            <button class="btn continue" @click=${this.abortActiveAndContinue}>Yes, continue queue</button>
            <button class="btn btn-abort" @click=${this.abortActiveAndPause}>No, pause queue</button>
            <button class="btn" @click=${() => { this.showAbortModal = false; }}>Cancel</button>
          </div>
        </div>
      </div>
    `;
  }

static styles = css`
    .section-card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
      margin-bottom: 12px;
    }

    .title-row h2 {
      font-size: 15px;
      font-weight: 600;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .title-row .subtitle {
      color: var(--muted);
      font-size: 12px;
      font-weight: 400;
    }

    .section-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
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
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    article {
      position: relative;
      display: grid;
      grid-template-columns: 1fr 180px auto;
      gap: 12px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 14px 18px;
      background: var(--surface);
      overflow: hidden;
    }

    article::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
    }

    .active-row::before {
      background: var(--primary);
    }

    .compile-active-row::before {
      background: #7c3aed;
    }

    .queued-row::before {
      background: var(--accent);
    }

    .compile-queued-row::before {
      background: var(--muted);
    }

    .position-num {
      color: var(--muted);
      font-weight: 500;
    }

    .status-pill {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .status-pill.flashing {
      background: #e0f2fe;
      color: #0369a1;
    }

    .status-pill.compiling {
      background: #ede9fe;
      color: #6d28d9;
    }

    .status-pill.queued {
      background: #fef3c7;
      color: #b45309;
    }

    .status-pill.history-status {
      font-size: 10px;
      padding: 2px 8px;
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

    .percent {
      font-size: 11px;
      color: var(--muted);
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

    .progress-wrap.queued {
      background: #fef3c7;
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

    .actions {
      display: flex;
      gap: 5px;
      align-items: center;
      justify-content: flex-end;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      font-family: inherit;
      font-size: 11px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
      min-height: 26px;
      min-width: 26px;
      line-height: 1;
      white-space: nowrap;
    }

    .btn:hover {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .btn-icon {
      min-width: 26px;
      padding: 4px;
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

    .btn.continue {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    button:disabled,
    .btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    button:disabled:hover,
    .btn:disabled:hover {
      background: var(--surface);
      color: var(--ink);
      border-color: var(--line);
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

    .queue-page {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .queue-toolbar {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      padding: 12px 0;
    }

    .history-tabs {
      display: flex;
      gap: 4px;
      margin-top: 12px;
      margin-bottom: 12px;
    }

    .history-tab {
      font-size: 12px;
      font-weight: 500;
      padding: 4px 14px;
      border-radius: 20px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--muted);
      cursor: pointer;
      font-family: inherit;
      transition: all 0.12s;
    }

    .history-tab.active {
      background: var(--ink);
      color: var(--surface);
      border-color: var(--ink);
    }

    .history-tab:hover:not(.active) {
      background: var(--line);
    }

    .history-table {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .history-row {
      display: grid;
      grid-template-columns: auto 1fr auto auto auto auto auto;
      gap: 8px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      padding: 6px 10px;
      font-size: 13px;
    }

    .history-row.combined-row {
      background: #fafcff;
    }

    .type-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      letter-spacing: 0.03em;
      min-width: 48px;
      text-align: center;
    }

    .type-flash {
      background: #e0f2fe;
      color: #0369a1;
    }

    .type-compile {
      background: #ede9fe;
      color: #6d28d9;
    }

    .type-combined {
      display: flex;
      align-items: center;
      padding: 0;
      overflow: hidden;
      border-radius: 4px;
    }

    .type-combined span {
      padding: 2px 4px;
      font-size: 9px;
      font-weight: 700;
      white-space: nowrap;
    }

    .type-combined .c-compile {
      background: #ede9fe;
      color: #6d28d9;
    }

    .type-combined .c-flash {
      background: #e0f2fe;
      color: #0369a1;
    }

    .device-label {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .device-label.clickable {
      cursor: pointer;
    }

    .device-label.clickable:hover {
      text-decoration: underline;
    }

    .device-meta {
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
    }

    .timestamp {
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }

    .duration {
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }

    .show-more {
      text-align: center;
      margin-top: 8px;
    }

    .show-more button {
      background: none;
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 6px 20px;
      font-size: 12px;
      font-weight: 500;
      color: var(--muted);
      cursor: pointer;
      font-family: inherit;
    }

    .show-more button:hover {
      background: var(--line);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'esp-queue-page': EspQueuePage;
  }
}
