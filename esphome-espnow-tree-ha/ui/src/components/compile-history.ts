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
                        <button class="btn" @click=${() => this.viewLogs()}>View logs</button>
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

    .table {
      display: grid;
      gap: 8px;
    }

    article {
      display: grid;
      grid-template-columns: minmax(160px, 1.2fr) auto minmax(160px, 1fr) auto;
      gap: 12px;
      align-items: center;
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 8px;
      padding: 10px 12px;
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
      padding: 4px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 600;
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

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      padding: 5px 10px;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
      min-height: 30px;
    }

    .btn:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    .empty {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
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