import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ref } from 'lit/directives/ref.js';
import { api } from '../api/client';

@customElement('esp-compile-log-viewer')
export class EspCompileLogViewer extends LitElement {
  @property({ type: String }) mac = '';
  @property({ type: Boolean }) visible = true;
  @property({ type: Boolean }) stopped = false;
  @state() private logs: string[] = [];
  @state() private autoScroll = true;
  private eventSource: EventSource | null = null;
  private _macObserved = '';
  private reconnectAttempts = 0;
  private reconnectDelay = 1000;

  private scrollTarget: HTMLElement | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.connect();
  }

  disconnectedCallback(): void {
    this.disconnect();
    super.disconnectedCallback();
  }

  updated(changed: Map<string, unknown>): void {
    this.hidden = !this.visible;
    if (changed.has('mac') && this.mac !== this._macObserved) {
      this.logs = [];
      this.reconnectAttempts = 0;
      this.connect();
    }
  }

  private connect(): void {
    if (this.stopped) return;
    this.disconnect();
    if (!this.mac) return;
    this._macObserved = this.mac;

    this.eventSource = api.streamCompileLogs(
      this.mac,
      (line: string) => {
        this.logs = [...this.logs, line];
        if (
          line === '[build exited with code 0]' ||
          line === '[build exited with code 1]' ||
          line === '[status: idle]'
        ) {
          this.stopped = true;
          this.disconnect();
        }
        if (this.autoScroll && this.visible) {
          this.updateComplete.then(() => this.scrollToBottom());
        }
      },
      (err: Event) => {
        this.handleStreamError(err);
      }
    );
  }

  private handleStreamError(_err: Event): void {
    if (this.stopped) return;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 10));
    setTimeout(() => this.connect(), delay);
  }

  private disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.reconnectAttempts = 0;
  }

  private scrollToBottom(): void {
    if (this.scrollTarget) {
      this.scrollTarget.scrollTop = this.scrollTarget.scrollHeight;
    }
  }

  private toggleAutoScroll(): void {
    this.autoScroll = !this.autoScroll;
  }

  private clearLogs(): void {
    this.logs = [];
  }

  render() {
    return html`
      <div class="log-header">
        <span class="label">Build Log</span>
        <div class="controls">
          <button class="ctrl-btn" @click=${this.clearLogs}>Clear</button>
          <button class="ctrl-btn ${this.autoScroll ? 'active' : ''}" @click=${this.toggleAutoScroll}>
            ${this.autoScroll ? 'Auto-scroll ↓' : 'Scroll lock'}
          </button>
        </div>
      </div>
      <div class="log-body" ${ref((el) => { this.scrollTarget = el as HTMLElement; })}>
        ${this.logs.length === 0
          ? html`<span class="empty">Waiting for build output...</span>`
          : html`<pre>${this.logs.join('\n')}</pre>`}
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      border: 1px solid var(--line);
      background: #1a1b1e;
      border-radius: 8px;
      overflow: hidden;
      margin-top: 8px;
    }
    :host([hidden]) {
      display: none;
    }
    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid var(--line);
      background: #25262b;
      font-size: 11px;
    }
    .label {
      color: var(--muted);
      font-weight: 600;
      text-transform: uppercase;
    }
    .controls {
      display: flex;
      gap: 4px;
    }
    .ctrl-btn {
      border: 1px solid rgba(255,255,255,0.08);
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.12s;
    }
    .ctrl-btn:hover,
    .ctrl-btn.active {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }
    .log-body {
      max-height: 400px;
      overflow-y: auto;
      padding: 10px;
    }
    pre {
      margin: 0;
      color: #c0c5ce;
      font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .empty {
      color: var(--muted);
      font-style: italic;
      font-size: 12px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'esp-compile-log-viewer': EspCompileLogViewer;
  }
}
