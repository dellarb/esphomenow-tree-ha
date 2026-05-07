import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { api } from '../api/client';

@customElement('esp-activity-log-page')
export class EspActivityLogPage extends LitElement {
  @state() private logs: string[] = [];
  @state() private error = '';
  @state() private loading = true;
  @state() private fullscreen = false;
  @state() private connected = false;
  private eventSource: EventSource | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.connect();
  }

  private connect(): void {
    this.disconnect();
    this.loading = true;
    this.error = '';
    this.logs = [];

    this.eventSource = api.activityLog(
      (line: string) => {
        this.logs = [line, ...this.logs];
        this.loading = false;
        this.connected = true;
        void this.requestUpdate();
      },
      () => {
        this.loading = false;
      },
      (_err: Event) => {
        this.loading = false;
        if (this.logs.length === 0) {
          this.error = 'Could not load activity log';
        }
      }
    );
  }

  private disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.connected = false;
    }
  }

  private clearLogs(): void {
    this.logs = [];
  }

  private downloadLog(): void {
    const content = this.logs.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'activity.log';
    a.click();
    URL.revokeObjectURL(url);
  }

  private toggleFullscreen(): void {
    if (!this.fullscreen) {
      this.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  private handleFullscreenChange = (): void => {
    this.fullscreen = !!document.fullscreenElement;
  };

  firstUpdated(): void {
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
  }

  disconnectedCallback(): void {
    this.disconnect();
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
    super.disconnectedCallback();
  }

  private renderLine(line: string) {
    return html`<pre class="log-line">${line}</pre>`;
  }

  render() {
    return html`
      <div class="page-header">
        <div class="header-left">
          <a href="#/settings" class="back-btn">\u2190 Back</a>
          <span class="title">Activity Log</span>
          ${this.connected ? html`<span class="live-dot" title="Connected"></span>` : ''}
        </div>
        <div class="header-controls">
          <button class="ctrl-btn" @click=${this.clearLogs}>Clear</button>
          <button class="ctrl-btn" @click=${this.downloadLog}>Download</button>
          <button class="ctrl-btn" @click=${this.toggleFullscreen}>
            ${this.fullscreen ? 'Collapse' : 'Fullscreen'}
          </button>
        </div>
      </div>
      <div class="log-body">
        ${this.error
          ? html`<span class="error-msg">${this.error}</span>`
          : this.loading && this.logs.length === 0
          ? html`<span class="empty">Loading...</span>`
          : this.logs.length === 0
          ? html`<span class="empty">No activity yet</span>`
          : this.logs.map((line) => this.renderLine(line))}
      </div>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    :host([hidden]) {
      display: none;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--line);
      background: var(--surface);
      flex-shrink: 0;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .back-btn {
      color: var(--primary);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background 0.12s;
    }
    .back-btn:hover {
      background: rgba(255,255,255,0.05);
    }
    .title {
      font-size: 15px;
      font-weight: 600;
    }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 6px #22c55e;
    }
    .header-controls {
      display: flex;
      gap: 6px;
    }
    .ctrl-btn {
      border: 1px solid rgba(255,255,255,0.1);
      background: transparent;
      color: var(--muted);
      font-family: inherit;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.12s;
    }
    .ctrl-btn:hover {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }
    .log-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
    }
    .log-line {
      margin: 0 0 2px 0;
      color: #c0c5ce;
      font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .empty, .error-msg {
      color: var(--muted);
      font-size: 13px;
      font-style: italic;
    }
    .error-msg {
      color: #ef4444;
    }

    :host(:fullscreen) {
      position: fixed;
      inset: 0;
      z-index: 9999;
    }
    :host(:fullscreen) .page-header {
      position: sticky;
      top: 0;
      z-index: 1;
    }
    :host(:fullscreen) .log-body {
      max-height: none;
      height: calc(100vh - 53px);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'esp-activity-log-page': EspActivityLogPage;
  }
}