import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { api, CompileResult, PreflightComparison } from '../api/client';

type CompilePhase = 'idle' | 'compiling' | 'success' | 'failed';

@customElement('esp-compile-status')
export class EspCompileStatus extends LitElement {
  @property({ type: String }) mac = '';
  @property({ type: Boolean }) hasConfig = false;
  @state() private phase: CompilePhase = 'idle';
  @state() private result: CompileResult | null = null;
  @state() private error = '';

  private async triggerCompile(): Promise<void> {
    if (this.phase === 'compiling') return;
    this.phase = 'compiling';
    this.error = '';
    this.result = null;
    try {
      this.result = await api.compileDevice(this.mac);
      const jobStatus = this.result.job?.status;
      if (jobStatus === 'compiling' || jobStatus === 'compile_queued') {
        this.phase = 'success';
      } else {
        this.phase = 'success';
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.phase = 'failed';
    }
  }

  private async flashNow(): Promise<void> {
    try {
      const { job } = await api.startCompileFlash(this.mac);
      if (job) {
        window.location.hash = `/device/${encodeURIComponent(this.mac)}`;
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private downloadFactory(): void {
    const url = api.downloadFactoryBinary(this.mac);
    window.open(url, '_blank');
  }

  render() {
    return html`
      <div class="compile-section">
        ${this.phase === 'idle'
          ? html`
              <button class="compile-btn" ?disabled=${!this.hasConfig} @click=${this.triggerCompile}>
                ${this.hasConfig ? 'Compile & Install' : 'No config to compile'}
              </button>
            `
          : this.phase === 'compiling'
            ? html`<button class="compile-btn compiling" disabled>Compiling...</button>`
            : this.phase === 'success'
              ? html`
                  <div class="success-banner">&#10003; Build submitted</div>
                  ${this.result?.preflight ? this.preflightTable(this.result.preflight) : nothing}
                  <div class="action-row">
                    <button class="flash-btn" @click=${this.flashNow}>&#9654; Flash via ESP-NOW</button>
                    <button class="download-btn" @click=${this.downloadFactory}>&#8595; Download factory .bin</button>
                  </div>
                  <p class="hint">The build has been queued. You can monitor progress on the config page.</p>
                `
              : this.phase === 'failed'
                ? html`
                    <div class="fail-banner">&#10007; Build failed</div>
                    ${this.error ? html`<p class="error-msg">${this.error}</p>` : nothing}
                    <p class="hint">Fix the YAML above and try again.</p>
                  `
                : nothing}
      </div>
    `;
  }

  private preflightTable(preflight: PreflightComparison) {
    const chip = preflight.chip;
    const name = preflight.name;
    const bd = preflight.build_date;

    return html`
      <div class="preflight-section">
        <h4>Preflight</h4>
        <table class="preflight-table">
          <tr>
            <td>Name</td>
            <td>
              ${name.new || '-'}
              <span class="badge ${name.match ? 'match' : 'mismatch'}">${name.match ? 'MATCH' : 'MISMATCH'}</span>
            </td>
          </tr>
          <tr>
            <td>Build</td>
            <td>
              ${bd.status !== 'unknown' && bd.delta ? `${bd.status.toUpperCase()} ${bd.delta}` : bd.status.toUpperCase()}
            </td>
          </tr>
          <tr>
            <td>Chip</td>
            <td>
              ${chip.new || '-'}
              <span class="badge ${chip.match ? 'match' : 'mismatch'}">${chip.match ? 'MATCH' : 'MISMATCH'}</span>
            </td>
          </tr>
        </table>
        ${preflight.has_warnings
          ? html`<div class="warnings">${preflight.warnings.map((w) => html`<p>${w}</p>`)}</div>`
          : nothing}
      </div>
    `;
  }

  static styles = css`
    .compile-section {
      margin-top: 8px;
    }
    .compile-btn {
      border: 2px solid var(--ink);
      background: var(--ok);
      color: white;
      padding: 8px 18px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 3px 3px 0 var(--ink);
      min-width: 200px;
    }
    .compile-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .compile-btn.compiling {
      background: var(--accent);
    }
    .success-banner {
      background: #dff8e8;
      color: var(--ok);
      border: 2px solid var(--ok);
      padding: 8px 12px;
      font-weight: 900;
      font-size: 14px;
    }
    .fail-banner {
      background: #fff1ed;
      color: var(--danger);
      border: 2px solid var(--danger);
      padding: 8px 12px;
      font-weight: 900;
      font-size: 14px;
    }
    .summary-row {
      display: flex;
      gap: 12px;
      padding: 8px 0;
      font-size: 13px;
      color: var(--muted);
    }
    .build-meta { font-weight: 700; }
    .build-sizes { font-weight: 700; color: var(--ink); }

    .preflight-section {
      margin: 8px 0;
      border: 1px solid var(--line);
      padding: 10px;
    }
    .preflight-section h4 {
      margin: 0 0 6px;
      font-size: 12px;
      text-transform: uppercase;
      color: var(--muted);
    }
    .preflight-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .preflight-table td {
      padding: 4px 0;
    }
    .preflight-table td:first-child {
      font-weight: 700;
      color: var(--muted);
      width: 80px;
    }
    .badge {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 900;
    }
    .badge.match { background: #dff8e8; color: var(--ok); }
    .badge.mismatch { background: #fff1ed; color: var(--danger); }
    .warnings { margin-top: 6px; }
    .warnings p {
      margin: 2px 0;
      font-size: 12px;
      color: var(--accent-2);
    }

    .action-row {
      display: flex;
      gap: 8px;
      margin: 10px 0;
    }
    .flash-btn {
      border: 2px solid var(--ok);
      background: var(--ok);
      color: white;
      padding: 8px 16px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 3px 3px 0 var(--ink);
    }
    .download-btn {
      border: 2px solid var(--ink);
      background: var(--panel);
      padding: 8px 16px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 3px 3px 0 var(--ink);
    }
    .hint {
      font-size: 11px;
      color: var(--muted);
      font-style: italic;
    }
    .error-msg {
      color: var(--danger);
      font-size: 13px;
      font-weight: 700;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'esp-compile-status': EspCompileStatus;
  }
}
