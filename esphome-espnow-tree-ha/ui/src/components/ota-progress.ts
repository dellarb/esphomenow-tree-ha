import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { OtaJob, fmtBytes, fmtTime } from '../api/client';

@customElement('esp-ota-progress')
export class EspOtaProgress extends LitElement {
  @property({ type: Object }) job!: OtaJob;

  render() {
    const percent = Math.max(0, Math.min(100, Number(this.job.percent || 0)));
    return html`
      <section class="progress-panel">
        <div class="progress-header">
          <div>
            <span class="label">Current flash</span>
            <h3>${this.job.firmware_name || 'firmware.ota.bin'}</h3>
          </div>
          <strong class="state">${this.job.status.replaceAll('_', ' ')}</strong>
        </div>
        <div class="bar" aria-label="OTA progress">
          <span style="width:${percent}%">${percent}%</span>
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
      border: 2px solid var(--ink);
      background: #fff8e8;
      padding: 12px;
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
      font-weight: 900;
      text-transform: uppercase;
    }

    h3 {
      margin: 4px 0 0;
      font-size: 16px;
      overflow-wrap: anywhere;
    }

    .state {
      color: var(--accent-2);
      text-transform: uppercase;
      font-size: 12px;
      text-align: right;
    }

    .bar {
      height: 18px;
      border: 2px solid var(--ink);
      background: white;
      margin-bottom: 10px;
      overflow: hidden;
    }

    .bar span {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
      transition: width 180ms ease;
      color: white;
      font-weight: 800;
      font-size: 12px;
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    }

    .bar span:empty {
      display: block;
    }

    .bar span:not(:empty) {
      min-width: 48px;
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
      font-weight: 900;
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
      font-weight: 800;
    }

    @media (max-width: 760px) {
      dl {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;
}
