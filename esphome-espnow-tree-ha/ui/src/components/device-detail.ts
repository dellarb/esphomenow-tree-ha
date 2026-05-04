import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { OtaJob, TopologyNode, api, fmtDuration, fmtTime, normalizeMac } from '../api/client';
import { CompileStatusResponse } from '../api/client';
import './device-diagnostics';
import './ota-box';
import './flash-history';
import './compile-history';
import './compile-log-viewer';

const ACTIVE_STATUSES = ['pending_confirm', 'queued', 'starting', 'transferring', 'verifying', 'transfer_success_waiting_rejoin'];
const COMPILE_ACTIVE_STATUSES = ['compile_queued', 'compiling'];

@customElement('esp-device-detail')
export class EspDeviceDetail extends LitElement {
  @property({ type: String }) mac = '';
  @state() private node: TopologyNode | null = null;
  @state() private currentJob: OtaJob | null = null;
  @state() private history: OtaJob[] = [];
  @state() private compileHistoryList: OtaJob[] = [];
  @state() private compileStatus: string = 'idle';
  @state() private loading = true;
  @state() private error = '';
  private timer: number | undefined;
  private compileTimer: ReturnType<typeof setInterval> | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
    this.schedulePoll();
  }

  disconnectedCallback(): void {
    if (this.timer) window.clearInterval(this.timer);
    if (this.compileTimer) window.clearInterval(this.compileTimer);
    super.disconnectedCallback();
  }

  private schedulePoll(): void {
    if (this.timer) window.clearInterval(this.timer);
    const isActive = this.currentJob && ACTIVE_STATUSES.includes(this.currentJob.status);
    const interval = isActive ? 2000 : 5000;
    this.timer = window.setInterval(() => void this.load(false), interval);
  }

  private pollCompileStatus(): void {
    api.getCompileStatus(this.mac).then((s: CompileStatusResponse) => {
      this.compileStatus = s.status;
      if (COMPILE_ACTIVE_STATUSES.includes(s.status)) {
        if (!this.compileTimer) {
          this.compileTimer = setInterval(() => this.pollCompileStatus(), 3000);
        }
      } else {
        if (this.compileTimer) {
          clearInterval(this.compileTimer);
          this.compileTimer = null;
        }
      }
    }).catch(() => {});
  }

  updated(): void {
    this.schedulePoll();
  }

  private async load(showLoading = true): Promise<void> {
    if (showLoading) this.loading = true;
    try {
      const [topology, current, queue, history, compileHistory] = await Promise.all([
        api.topology(),
        api.currentOtaForDevice(this.mac),
        api.getQueue(),
        api.history(this.mac),
        api.getCompileHistory(this.mac),
      ]);
      this.node = topology.find((node) => normalizeMac(node.mac) === normalizeMac(this.mac)) || null;
      const nm = normalizeMac(this.mac);
      const queuedForThis = (queue.queued_jobs ?? []).find((j) => normalizeMac(j.mac) === nm) ?? null;
      if (current && current.job && normalizeMac(current.job.mac) === nm) {
        this.currentJob = current.job;
      } else if (queuedForThis) {
        this.currentJob = queuedForThis;
      } else {
        this.currentJob = current.job;
      }
      this.history = history.jobs;
      this.compileHistoryList = compileHistory.jobs;
      this.error = '';
      const compileResp = await api.getCompileStatus(this.mac).catch(() => null);
      if (compileResp) {
        this.compileStatus = compileResp.status;
      }
      if (COMPILE_ACTIVE_STATUSES.includes(this.compileStatus)) {
        this.pollCompileStatus();
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
    }
  }

  private goBack(): void {
    window.location.hash = '/';
  }

  private goToConfig(): void {
    window.location.hash = `/device/${encodeURIComponent(this.mac)}/config`;
  }

  render() {
    if (this.loading) return html`<div class="card">Loading device...</div>`;
    if (this.error) return html`<div class="card error">${this.error}</div>`;
    if (!this.node) {
      return html`
        <div class="card">
          <button class="back" @click=${this.goBack}>Back</button>
          <p>Device ${this.mac} is not present in the current bridge topology.</p>
        </div>
      `;
    }
    return html`
      <button class="back" @click=${this.goBack}>Back to topology</button>
      <section class="hero">
        <div>
          <span class="state-pill ${this.node.online ? 'online' : 'offline'}">${this.node.online ? 'online' : (this.node.offline_reason || 'offline')}</span>
          <h2>${this.node.friendly_name || this.node.esphome_name || this.node.label || this.node.mac}</h2>
          <p>${this.node.mac} / ${this.node.hops ?? 0} hop${(this.node.hops ?? 0) === 1 ? '' : 's'} / uptime ${fmtDuration(this.node.uptime_s)} / last seen ${this.node.last_seen_ms ? fmtTime(this.node.last_seen_ms / 1000) : '-'}</p>
        </div>
        <div class="hero-right">
          ${(this.node.hops ?? 0) > 0 ? html`<button class="edit-config-btn" @click=${this.goToConfig}>Edit Config &#9998;</button>` : nothing}
          <strong>${this.node.rssi == null ? '-' : `${this.node.rssi} dBm`}</strong>
        </div>
      </section>

      <div class="layout">
        <section class="card diagnostics">
          <esp-device-diagnostics .node=${this.node}></esp-device-diagnostics>
        </section>
        <section class="card">
          <esp-ota-box .mac=${this.node.mac} .node=${this.node} .currentJob=${this.currentJob} @ota-changed=${() => void this.load(false)}></esp-ota-box>
        </section>
        <section class="card history">
          <esp-flash-history .jobs=${this.history} @ota-changed=${() => void this.load(false)}></esp-flash-history>
        </section>
        <section class="panel history">
          <esp-compile-history .jobs=${this.compileHistoryList} .mac=${this.mac}></esp-compile-history>
        </section>
        ${COMPILE_ACTIVE_STATUSES.includes(this.compileStatus) || this.compileStatus === 'failed'
          ? html`<section class="panel history">
              <esp-compile-log-viewer .mac=${this.mac} .visible=${true}></esp-compile-log-viewer>
            </section>`
          : nothing}
      </div>
    `;
  }

  static styles = css`
    .back {
      border: 1px solid var(--line);
      background: var(--surface);
      min-height: 36px;
      padding: 0 14px;
      font: inherit;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 16px;
      font-size: 13px;
      transition: all 0.12s;
    }

    .back:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    .hero,
    .card {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 12px;
      box-shadow: var(--shadow);
    }

    .hero {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: end;
      padding: 20px 24px;
      margin-bottom: 20px;
    }

    .hero-right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    }

    .edit-config-btn {
      border: 1px solid var(--line);
      background: var(--surface);
      min-height: 32px;
      padding: 0 12px;
      font: inherit;
      font-size: 12px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.12s;
    }

    .edit-config-btn:hover {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .hero h2 {
      margin: 8px 0 0;
      font-size: 28px;
      font-weight: 700;
      line-height: 1;
      overflow-wrap: anywhere;
    }

    .hero p {
      color: var(--muted);
      margin: 6px 0 0;
      font-size: 14px;
    }

    .hero > strong {
      font-size: 20px;
      font-weight: 700;
      color: var(--primary);
      white-space: nowrap;
    }

    .state-pill {
      display: inline-block;
      border-radius: 20px;
      padding: 4px 12px;
      text-transform: uppercase;
      font-size: 12px;
      font-weight: 600;
    }

    .online {
      background: #dcfce7;
      color: #166534;
    }

    .offline {
      background: #fef2f2;
      color: #991b1b;
    }

    .layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }

    .card {
      padding: 16px 20px;
    }

    .history {
      grid-column: 1 / -1;
    }

    .error {
      color: var(--danger);
      font-weight: 500;
      padding: 12px;
      border: 1px solid var(--danger);
      border-radius: 8px;
      background: #fef2f2;
    }

    @media (max-width: 900px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .hero {
        align-items: start;
        flex-direction: column;
      }
    }
  `;
}
