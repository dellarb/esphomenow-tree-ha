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
          <span>History</span>
          <h2>Flash Log</h2>
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
                      <span class="status ${job.status}">${job.status.replaceAll('_', ' ')}</span>
                      <div class="version">
                        <small>${job.parsed_build_date || '-'}</small>
                        ${job.error_msg ? html`<em>${job.error_msg}</em>` : nothing}
                      </div>
                      <div class="actions">
                        ${this.retained(job)
                          ? html`
                              <button ?disabled=${this.busyJob === job.id} @click=${() => this.reflash(job)}>Flash again</button>
                              <button ?disabled=${this.busyJob === job.id} @click=${() => this.deleteRetained(job)}>Delete binary</button>
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

    .failed,
    .rejoin_timeout,
    .version_mismatch,
    .aborted {
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

    .empty,
    .error {
      margin: 0;
      color: var(--muted);
    }

    .error {
      color: var(--danger);
      font-weight: 900;
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
