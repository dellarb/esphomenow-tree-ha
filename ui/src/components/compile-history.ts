import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { api, OtaJob, fmtTimeAgo, fmtDuration } from '../api/client';

@customElement('esp-compile-history')
export class EspCompileHistory extends LitElement {
  @property({ type: Array }) jobs: OtaJob[] = [];
  @property({ type: String }) mac = '';

  private viewJobLog(job: OtaJob): void {
    const from = `/device/${encodeURIComponent(this.mac)}`;
    window.location.hash = `/job/${job.id}?from=${encodeURIComponent(from)}`;
  }

  private statusLabel(job: OtaJob): string {
    if (job.status === 'compile_success') return 'compile success';
    return job.status.replaceAll('_', ' ');
  }

  private statusStyle(status: string): string {
    const map: Record<string, string> = {
      compile_success: 'background:#dcfce7;color:#15803d;',
      success: 'background:#dcfce7;color:#15803d;',
      failed: 'background:#fef2f2;color:#dc2626;',
    };
    return map[status] || 'background:#f1f5f9;color:#475569;';
  }

  render() {
    const compileJobs = this.jobs.filter(j => j.status === 'compile_success' || j.status === 'failed');
    return html`
      <section>
        <div class="title-row">
          <h2>Compile Log</h2>
        </div>
        ${compileJobs.length
          ? html`
              <div class="table">
                ${compileJobs.map(
                  (job) => {
                    const duration = job.completed_at && job.started_at ? fmtDuration(job.completed_at - job.started_at) : '';
                    return html`
                      <article>
                        <div>
                          <strong>${job.parsed_esphome_name || job.firmware_name || 'compile'}</strong>
                          <small>v${job.parsed_version || '-'} / ${job.parsed_build_date || '-'}</small>
                          ${job.error_msg ? html`<em>${job.error_msg}</em>` : nothing}
                        </div>
                        <span class="status-pill" style=${this.statusStyle(job.status)}>${this.statusLabel(job)}</span>
                        <span class="timestamp">${fmtTimeAgo(job.created_at)}</span>
                        <span class="duration">${duration}</span>
                        <div class="actions">
                          <button class="btn" @click=${() => this.viewJobLog(job)}>View log</button>
                          <a class="btn" href=${api.downloadJobBinary(job.id)} target="_blank" rel="noopener">Download .bin</a>
                        </div>
                      </article>
                    `;
                  }
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
      gap: 12px;
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    h2 {
      margin: 2px 0 0;
      font-size: 16px;
      font-weight: 600;
    }

    .table {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    article {
      display: grid;
      grid-template-columns: 1fr auto auto auto;
      gap: 10px;
      align-items: center;
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 13px;
    }

    strong {
      display: block;
      overflow-wrap: anywhere;
      font-size: 13px;
      font-weight: 600;
    }

    small {
      display: block;
      color: var(--muted);
      font-size: 11px;
      margin-top: 1px;
    }

    em {
      display: block;
      color: var(--danger);
      font-style: normal;
      margin-top: 4px;
      font-size: 11px;
    }

    .status-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
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

    .actions {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
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
        justify-content: flex-start;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'esp-compile-history': EspCompileHistory;
  }
}
