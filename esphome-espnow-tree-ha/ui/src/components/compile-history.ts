import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { OtaJob, fmtTime } from '../api/client';

@customElement('esp-compile-history')
export class EspCompileHistory extends LitElement {
  @property({ type: Array }) jobs: OtaJob[] = [];
  @property({ type: String }) mac = '';

  private viewLogs(): void {
    window.location.hash = `/device/${encodeURIComponent(this.mac)}/config`;
  }

  render() {
    const compileJobs = this.jobs.filter(j => j.status === 'success' || j.status === 'failed');
    return html`
      <section>
        <div class="title-row">
          <span>History</span>
          <h2>Compile Log</h2>
        </div>
        ${compileJobs.length
          ? html`
              <div class="table">
                ${compileJobs.map(
                  (job) => html`
                    <article>
                      <div>
                        <strong>${job.parsed_esphome_name || job.firmware_name || 'compile'}</strong>
                        <small>${fmtTime(job.created_at)}</small>
                      </div>
                      <span class="status ${job.status}">${job.status.replaceAll('_', ' ')}</span>
                      <div class="version">
                        <small>${job.parsed_build_date || '-'} / v${job.parsed_version || '-'}</small>
                        ${job.error_msg ? html`<em>${job.error_msg}</em>` : nothing}
                      </div>
                      <div class="actions">
                        <button @click=${() => this.viewLogs()}>View logs</button>
                      </div>
                    </article>
                  `
                )}
              </div>
            `
          : html`<p class="empty">No compile history for this node yet.</p>`}
      </section>
    `;
  }

  static styles = css`
    section {
      display: grid;
      gap: 10px;
    }

    .title-row span {
      color: var(--accent);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
    }

    h2 {
      margin: 2px 0 0;
      font-size: 20px;
    }

    .table {
      display: grid;
      gap: 8px;
    }

    article {
      display: grid;
      grid-template-columns: minmax(160px, 1.2fr) auto minmax(160px, 1fr) auto;
      gap: 10px;
      align-items: center;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.6);
      padding: 10px;
    }

    strong,
    small,
    em {
      display: block;
      overflow-wrap: anywhere;
    }

    small {
      color: var(--muted);
      font-size: 11px;
    }

    em {
      color: var(--danger);
      font-style: normal;
      margin-top: 4px;
      font-size: 11px;
    }

    .status {
      border: 1px solid var(--line);
      padding: 4px 6px;
      text-transform: uppercase;
      font-weight: 900;
      font-size: 11px;
      white-space: nowrap;
    }

    .success {
      color: var(--ok);
    }

    .failed {
      color: var(--danger);
    }

    .actions {
      display: flex;
      gap: 6px;
      justify-content: end;
      flex-wrap: wrap;
    }

    button {
      border: 2px solid var(--ink);
      background: var(--panel);
      min-height: 32px;
      padding: 0 9px;
      font: inherit;
      font-size: 11px;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 2px 2px 0 var(--ink);
    }

    button:hover {
      background: var(--accent);
      color: white;
    }

    .empty {
      margin: 0;
      color: var(--muted);
    }

    @media (max-width: 880px) {
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
    'esp-compile-history': EspCompileHistory;
  }
}