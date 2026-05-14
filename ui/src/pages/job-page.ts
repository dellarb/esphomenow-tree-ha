import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { api, fmtBytes, fmtTime, fmtDuration, type OtaJob, type JobLogResponse, type LogEvent } from '../api/client';

const STATUS_LABELS: Record<string, string> = {
  compile_queued: 'Queued for compile',
  compiling: 'Compiling',
  compile_success: 'Compile success',
  queued: 'Queued for flash',
  starting: 'Starting',
  announcing: 'Waiting for device accept',
  transferring: 'Transferring',
  verifying: 'Verifying',
  transfer_success_waiting_rejoin: 'Waiting for device rejoin',
  success: 'Success',
  failed: 'Failed',
  aborted: 'Aborted',
  rejoin_timeout: 'Rejoin timeout',
  version_mismatch: 'Version mismatch',
};

const EVENT_ICONS: Record<string, string> = {
  compile_queued: '\u2699',
  compile_dequeued: '\u2699',
  compiling: '\u2699',
  compile_success: '\u2705',
  compile_failed: '\u274C',
  compile_output: '\u{1F4CB}',
  compile_cancelled: '\u274C',
  flash_queued: '\u{1F4E6}',
  flash_dequeued: '\u{1F4E6}',
  flash_starting: '\u25B6',
  flash_announcing: '\u23F3',
  flash_transferring: '\u{1F4E4}',
  flash_progress: '\u{1F4C8}',
  flash_verifying: '\u2705',
  flash_rejoin_waiting: '\u23F3',
  flash_rejoined: '\u{1F504}',
  flash_version_mismatch: '\u26A0',
  flash_rejoin_timeout: '\u23F0',
  flash_success: '\u2705',
  flash_failed: '\u274C',
  flash_aborted: '\u{1F6D1}',
  flash_start_failed: '\u274C',
  dequeue_retry: '\u{1F504}',
  dequeue_moved_back: '\u{1F504}',
  ota_start_retry: '\u{1F504}',
};

const TERMINAL_STATUSES = ['compile_success', 'success', 'failed', 'aborted', 'rejoin_timeout', 'version_mismatch'];

@customElement('esp-job-page')
export class EspJobPage extends LitElement {
  @property({ type: Number }) jobId = 0;
  @property({ type: String }) from = '/queue';
  @state() private job: OtaJob | null = null;
  @state() private logData: JobLogResponse | null = null;
  @state() private error = '';
  @state() private loading = true;
  @state() private expandedOutput: Set<number> = new Set();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  connectedCallback(): void {
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    this.stopPolling();
    super.disconnectedCallback();
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('jobId') && this.jobId) {
      this.loading = true;
      this.error = '';
      this.fetchLog();
    }
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.fetchLog(), 2000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async fetchJob(): Promise<void> {
    if (!this.jobId) return;
    try {
      const mac = this.logData?.mac;
      if (mac) {
        const resp = await api.history(mac);
        const found = resp.jobs.find(j => j.id === this.jobId);
        this.job = found || null;
      }
    } catch {
      // job info may not be available via log endpoint alone
    }
  }

  private async fetchLog(): Promise<void> {
    if (!this.jobId) return;
    try {
      this.logData = await api.jobLog(this.jobId);
      this.loading = false;
      if (!this.job && this.logData?.mac) {
        await this.fetchJob();
      }
      if (this.logData?.is_terminal) {
        this.stopPolling();
      } else {
        this.startPolling();
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.loading = false;
      this.stopPolling();
    }
  }

  private toggleOutput(idx: number): void {
    const next = new Set(this.expandedOutput);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    this.expandedOutput = next;
  }

  private formatEventTime(ts: number): string {
    return new Date(ts * 1000).toLocaleTimeString();
  }

  private renderEvent(ev: LogEvent, idx: number): unknown {
    const icon = EVENT_ICONS[ev.type] || '\u2022';
    const time = this.formatEventTime(ev.ts);
    const isOutput = ev.type === 'compile_output';
    const isExpanded = this.expandedOutput.has(idx);

    const statusColors: Record<string, string> = {
      compile_success: 'ok',
      flash_success: 'ok',
      compile_failed: 'danger',
      flash_failed: 'danger',
      flash_aborted: 'danger',
      flash_version_mismatch: 'warn',
      flash_rejoin_timeout: 'warn',
    };
    const colorClass = statusColors[ev.type] || '';

    return html`
      <div class="event ${isOutput ? 'event-output' : ''} ${colorClass}">
        <div class="event-header" @click=${isOutput ? (() => this.toggleOutput(idx)) : undefined}>
          <span class="event-icon">${icon}</span>
          <span class="event-time">${time}</span>
          <span class="event-type">${ev.type.replaceAll('_', ' ')}</span>
          ${ev.percent != null ? html`<span class="event-detail">${ev.percent}%</span>` : nothing}
          ${ev.error ? html`<span class="event-error">${ev.error}</span>` : nothing}
          ${ev.reason ? html`<span class="event-detail">${ev.reason}</span>` : nothing}
          ${ev.esphome_name ? html`<span class="event-detail">${ev.esphome_name}</span>` : nothing}
          ${ev.firmware_name ? html`<span class="event-detail">${ev.firmware_name}</span>` : nothing}
          ${ev.duration_s != null ? html`<span class="event-detail">took ${fmtDuration(ev.duration_s as number)}</span>` : nothing}
          ${ev.current_md5 ? html`<span class="event-detail">current running firmware MD5: ${ev.current_md5}</span>` : nothing}
          ${ev.md5 ? html`<span class="event-detail">New firmware MD5: ${ev.md5}</span>` : nothing}
          ${ev.rejoined_md5 && ev.expected_md5 ? html`<span class="event-detail">running firmware MD5: ${ev.rejoined_md5} expected MD5: ${ev.expected_md5}</span>` : nothing}
          ${ev.rejoined_md5 && !ev.expected_md5 ? html`<span class="event-detail">running firmware MD5: ${ev.rejoined_md5}</span>` : nothing}
          ${ev.expected_md5 && !ev.rejoined_md5 ? html`<span class="event-detail">expected MD5: ${ev.expected_md5}</span>` : nothing}
          ${ev.md5_match ? html`<span class="event-tag ${ev.md5_match === 'match' ? 'ok' : 'warn'}">MD5 ${ev.md5_match}</span>` : nothing}
          ${isOutput ? html`<span class="toggle">${isExpanded ? 'hide' : 'show output'}</span>` : nothing}
        </div>
        ${isOutput && isExpanded
          ? html`<pre class="compile-output">${ev.output || ''}</pre>`
          : nothing}
      </div>
    `;
  }

  render() {
    const log = this.logData;
    const job = this.job;
    const events = log?.log_events || [];
    const status = log?.status || job?.status || '';
    const isTerminal = log?.is_terminal ?? (job ? TERMINAL_STATUSES.includes(job.status) : false);

    const backPath = this.from || '/queue';
    const backLabel = backPath.startsWith('/device/') ? 'Device' : backPath === '/queue' ? 'Queue' : backPath.replace(/^\//, '');

    return html`
      <section>
        <div class="title-row">
          <a class="back-link" href="#${backPath}">&larr; ${backLabel}</a>
          <div>
            <h2>${job?.firmware_name || 'Firmware'}</h2>
          </div>
        </div>

        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}

        ${job ? html`
          <div class="meta">
            <div class="meta-item">
              <small>Status</small>
              <span class="status-chip ${status}">${STATUS_LABELS[status] || status.replaceAll('_', ' ')}</span>
            </div>
            <div class="meta-item">
              <small>Device</small>
              <span>${job.mac}</span>
            </div>
            <div class="meta-item">
              <small>Size</small>
              <span>${fmtBytes(job.firmware_size)}</span>
            </div>
            ${job.started_at ? html`
              <div class="meta-item">
                <small>Started</small>
                <span>${fmtTime(job.started_at)}</span>
              </div>
            ` : nothing}
            ${job.completed_at ? html`
              <div class="meta-item">
                <small>Completed</small>
                <span>${fmtTime(job.completed_at)}</span>
              </div>
            ` : nothing}
            ${job.started_at && job.completed_at ? html`
              <div class="meta-item">
                <small>Duration</small>
                <span>${fmtDuration(job.completed_at - job.started_at)}</span>
              </div>
            ` : nothing}
            ${job.error_msg ? html`
              <div class="meta-item meta-full">
                <small>Error</small>
                <span class="error">${job.error_msg}</span>
              </div>
            ` : nothing}
          </div>
        ` : nothing}

        ${!isTerminal ? html`<div class="live-indicator">Live<span class="pulse"></span></div>` : nothing}

        <div class="log-header">
          <span class="label">Event Log</span>
          <span class="count">${events.length} events</span>
        </div>
        <div class="log-body">
          ${this.loading
            ? html`<span class="empty">Loading...</span>`
            : events.length === 0
              ? html`<span class="empty">No events recorded for this job.</span>`
              : events.map((ev, idx) => this.renderEvent(ev, idx))}
        </div>
      </section>
    `;
  }

  static styles = css`
    section {
      display: grid;
      gap: 12px;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 8px;
    }

    .back-link {
      color: var(--primary);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
    }

    .back-link:hover {
      text-decoration: underline;
    }

    .title-row span {
      color: var(--primary);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    h2 {
      margin: 2px 0 0;
      font-size: 16px;
      font-weight: 600;
    }

    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 8px 16px;
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 8px;
      padding: 12px 16px;
    }

    .meta-item {
      display: grid;
      gap: 2px;
    }

    .meta-item small {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
    }

    .meta-item span {
      font-size: 13px;
    }

    .meta-full {
      grid-column: 1 / -1;
    }

    .status-chip {
      border: 1px solid var(--line);
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 600;
      font-size: 11px;
    }

    .success {
      color: var(--ok);
    }

    .failed,
    .aborted {
      color: var(--danger);
    }

    .rejoin_timeout,
    .version_mismatch {
      color: var(--accent);
    }

    .live-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--ok);
    }

    .pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--ok);
      animation: blink 1.2s ease-in-out infinite;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #25262b;
      border: 1px solid var(--line);
      border-bottom: none;
      border-radius: 8px 8px 0 0;
      margin-top: 4px;
    }

    .label {
      color: #9ba1a7;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
    }

    .count {
      color: #64748b;
      font-size: 11px;
    }

    .log-body {
      background: #1a1b1e;
      border: 1px solid var(--line);
      border-top: none;
      border-radius: 0 0 8px 8px;
      max-height: 600px;
      overflow-y: auto;
      padding: 8px 0;
    }

    .empty {
      color: var(--muted);
      font-style: italic;
      font-size: 13px;
      display: block;
      padding: 16px 12px;
    }

    .event {
      padding: 4px 12px;
    }

    .event:hover {
      background: rgba(255,255,255,0.03);
    }

    .event.ok .event-type {
      color: var(--ok);
    }

    .event.danger .event-type,
    .event.danger .event-error {
      color: var(--danger);
    }

    .event.warn .event-type {
      color: var(--accent);
    }

    .event-output .event-header {
      cursor: pointer;
    }

    .event-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
    }

    .event-icon {
      font-size: 12px;
      width: 18px;
      text-align: center;
    }

    .event-time {
      color: #64748b;
      font-family: ui-monospace, 'SFMono-Regular', 'Cascadia Code', monospace;
      font-size: 12px;
    }

    .event-type {
      color: #c0c5ce;
      font-weight: 600;
      font-size: 12px;
    }

    .event-detail {
      color: #9ba1a7;
      font-size: 11px;
    }

    .event-tag {
      font-size: 11px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 4px;
    }

    .event-tag.ok {
      color: var(--ok);
      background: color-mix(in srgb, var(--ok) 15%, transparent);
    }

    .event-tag.warn {
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 15%, transparent);
    }

    .event-error {
      color: var(--danger);
      font-size: 12px;
    }

    .toggle {
      color: var(--primary);
      font-size: 11px;
      cursor: pointer;
    }

    .compile-output {
      margin: 4px 0 4px 26px;
      color: #9ba1a7;
      font-family: ui-monospace, 'SFMono-Regular', 'Cascadia Code', monospace;
      font-size: 11px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 400px;
      overflow-y: auto;
      background: #111216;
      border-radius: 4px;
      padding: 8px;
    }

    .error {
      color: var(--danger);
      font-weight: 500;
      margin: 0;
    }

    @media (max-width: 720px) {
      .meta {
        grid-template-columns: 1fr;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'esp-job-page': EspJobPage;
  }
}
