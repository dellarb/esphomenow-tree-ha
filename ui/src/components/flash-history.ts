import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { OtaJob, api, fmtBytes, fmtTimeAgo, fmtDuration } from '../api/client';

@customElement('esp-flash-history')
export class EspFlashHistory extends LitElement {
  @property({ type: Array }) jobs: OtaJob[] = [];
  @property({ type: String }) mac = '';
  @state() private busyJob: number | null = null;
  @state() private error = '';

  private retained(job: OtaJob): boolean {
    return !!job.firmware_path && !!job.retained_until && job.retained_until > Math.floor(Date.now() / 1000);
  }

  private viewLog(job: OtaJob): void {
    const from = `/device/${encodeURIComponent(this.mac || job.mac)}`;
    window.location.hash = `/job/${job.id}?from=${encodeURIComponent(from)}`;
  }

  private async reflash(job: OtaJob): Promise<void> {
    this.busyJob = job.id;
    this.error = '';
    try {
      const result = await api.reflash(job.id);
      this.dispatchEvent(new CustomEvent('ota-reflash-result', {
        bubbles: true,
        composed: true,
        detail: { job: result.job, preflight: result.preflight },
      }));
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

  private statusLabel(job: OtaJob): string {
    if (job.status === 'success') return 'OTA Upload Success';
    return job.status.replaceAll('_', ' ');
  }

  private statusStyle(status: string): string {
    const map: Record<string, string> = {
      success: 'background:#dcfce7;color:#15803d;',
      failed: 'background:#fef2f2;color:#dc2626;',
      aborted: 'background:#fef3c7;color:#b45309;',
      rejoin_timeout: 'background:#fef3c7;color:#b45309;',
      version_mismatch: 'background:#fef3c7;color:#b45309;',
    };
    return map[status] || 'background:#f1f5f9;color:#475569;';
  }

  render() {
    return html`
      <section>
        <div class="title-row">
          <div>
            <h2>Flash Log</h2>
          </div>
        </div>
        ${this.error ? html`<p class="error">${this.error}</p>` : nothing}
        ${this.jobs.length
          ? html`
              <div class="table">
                ${this.jobs.map(
                  (job) => {
                    const duration = job.completed_at && job.started_at ? fmtDuration(job.completed_at - job.started_at) : '';
                    return html`
                      <article>
                        <div>
                          <strong>${job.parsed_esphome_name || job.esphome_name || job.firmware_name || 'firmware.ota.bin'}</strong>
                          <small>${job.parsed_build_date || job.firmware_name || ''}${job.firmware_size ? html` · ${fmtBytes(job.firmware_size)}` : nothing}</small>
                          ${job.error_msg ? html`<em>${job.error_msg}</em>` : nothing}
                        </div>
                        <span class="status-pill" style=${this.statusStyle(job.status)}>${this.statusLabel(job)}</span>
                        <span class="timestamp">${fmtTimeAgo(job.created_at)}</span>
                        <span class="duration">${duration}</span>
                        <div class="actions">
                          <button class="btn" @click=${() => this.viewLog(job)}>View log</button>
                          ${this.retained(job)
                            ? html`
                                <button class="btn" ?disabled=${this.busyJob === job.id} @click=${() => this.reflash(job)}>Flash again</button>
                                <button class="btn" ?disabled=${this.busyJob === job.id} @click=${() => this.deleteRetained(job)}>Delete binary</button>
                              `
                            : nothing}
                        </div>
                      </article>
                    `;
                  }
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
