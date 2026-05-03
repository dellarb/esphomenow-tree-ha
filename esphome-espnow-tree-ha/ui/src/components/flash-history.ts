import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { OtaJob, api, fmtBytes, fmtTime } from '../api/client';

@customElement('esp-flash-history')
export class EspFlashHistory extends LitElement {
  @property({ type: Array }) jobs: OtaJob[] = [];
  @state() private busyJob: number | null = null;
  @state() private error = '';

  private retained(job: OtaJob): boolean {
    return !!job.firmware_path && !!job.retained_until && job.retained_until > Math.floor(Date.now() / 1000);
  }

  private async reflash(job: OtaJob): Promise<void> {
    this.busyJob = job.id;
    this.error = '';
    try {
      await api.reflash(job.id);
      this.dispatchChanged();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busyJob = null;
    }
  }

  private async deleteRetained(job: OtaJob): Promise<void> {
    this.busyJob = job.id;
    this.error = '';
    try {
      await api.deleteRetained(job.id);
      this.dispatchChanged();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busyJob = null;
    }
  }

  private dispatchChanged(): void {
    this.dispatchEvent(new CustomEvent('ota-changed', { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <section>
        <div class="title-row">
          <div>
            <span>History</span>
            <h2>Flash Log</h2>
          </div>
        </div>
        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
        ${this.jobs.length
          ? html`
              <div class="table">
                ${this.jobs.map(
                  (job) => html`
                    <article>
                      <div>
                        <strong>${job.firmware_name || 'firmware.ota.bin'}</strong>
                        <small>${fmtTime(job.created_at)} / ${fmtBytes(job.firmware_size)}</small>
                      </div>
                      <span class="status-chip ${job.status}">${job.status.replaceAll('_', ' ')}</span>
                      <div class="version">
                        <small>${job.parsed_build_date || '-'}</small>
                        ${job.error_msg ? html`<em>${job.error_msg}</em>` : nothing}
                      </div>
                      <div class="actions">
                        ${this.retained(job)
                          ? html`
                              <button class="btn" ?disabled=${this.busyJob === job.id} @click=${() => this.reflash(job)}>Flash again</button>
                              <button class="btn" ?disabled=${this.busyJob === job.id} @click=${() => this.deleteRetained(job)}>Delete binary</button>
                            `
                          : html`<small>No retained binary</small>`}
                      </div>
                    </article>
                  `
                )}
              </div>
            `
          : html`<p class="empty">No flash history for this node yet.</p>`}
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
      grid-template-columns: 1.2fr auto 1fr auto;
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
      font-size: 12px;
    }

    em {
      color: var(--danger);
      font-style: normal;
      margin-top: 4px;
      font-size: 12px;
    }

    .status-chip {
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

    .failed,
    .rejoin_timeout,
    .version_mismatch,
    .aborted {
      color: var(--danger);
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

    .empty,
    .error {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }

    .error {
      color: var(--danger);
      font-weight: 500;
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
