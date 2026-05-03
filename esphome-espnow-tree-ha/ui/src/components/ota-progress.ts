import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { OtaJob, fmtBytes, fmtTime } from '../api/client';

@customElement('esp-ota-progress')
export class EspOtaProgress extends LitElement {
  @property({ type: Object }) job!: OtaJob;

  render() {
    const percent = Math.max(0, Math.min(100, Number(this.job.percent || 0)));
    const terminal = ['success', 'failed', 'aborted', 'rejoin_timeout', 'version_mismatch'].includes(this.job.status);
    const panelClass = terminal ? (this.job.status === 'success' ? 'progress-panel success' : 'progress-panel failure') : 'progress-panel';
    return html`
      <section class="${panelClass}">
        <div class="progress-header">
          <div>
            <span class="label">Current flash</span>
            <h3>${this.job.firmware_name || 'firmware.ota.bin'}</h3>
          </div>
          <strong class="state">${this.job.status.replaceAll('_', ' ')}</strong>
        </div>
        <div class="bar" style="--bar-percent: ${percent}%" aria-label="OTA progress">
          <span>${percent}%</span>
        </div>
        <dl>
          <div><dt>Chunks</dt><dd>${this.job.chunks_sent ?? 0} / ${this.job.total_chunks ?? '-'}</dd></div>
          <div><dt>Bridge</dt><dd>${this.job.bridge_state || '-'}</dd></div>
          <div><dt>Size</dt><dd>${fmtBytes(this.job.firmware_size)}</dd></div>
          <div><dt>Started</dt><dd>${fmtTime(this.job.started_at)}</dd></div>
        </dl>
        ${this.job.error_msg ? html`<p class="error">${this.job.error_msg}</p>` : nothing}
      </section>
    `;
  }

  static styles = css`
    .progress-panel {
      border: 1px solid var(--line);
      background: #fffbeb;
      border-radius: 8px;
      padding: 16px;
    }

    .progress-panel.success {
      border-color: var(--ok);
      background: #dcfce7;
    }

    .progress-panel.failure {
      border-color: var(--danger);
      background: #fef2f2;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
      margin-bottom: 12px;
    }

    .label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    h3 {
      margin: 4px 0 0;
      font-size: 16px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .state {
      color: var(--accent);
      text-transform: uppercase;
      font-size: 12px;
      font-weight: 500;
      text-align: right;
    }

    .bar {
      position: relative;
      height: 8px;
      background: var(--line);
      border-radius: 4px;
      margin-bottom: 12px;
      overflow: hidden;
    }

    .bar::after {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      width: var(--bar-percent, 0%);
      background: var(--primary);
      border-radius: 4px;
      transition: width 180ms ease;
    }

    .bar span {
      display: none;
    }

    dl {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 0;
    }

    dt {
      color: var(--muted);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }

    dd {
      margin: 3px 0 0;
      overflow-wrap: anywhere;
      font-size: 12px;
    }

    .error {
      color: var(--danger);
      margin: 10px 0 0;
      font-size: 12px;
    }

    @media (max-width: 760px) {
      dl {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;
}
