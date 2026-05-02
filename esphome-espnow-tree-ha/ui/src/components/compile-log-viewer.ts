import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { api } from '../api/client';

@customElement('esp-compile-log-viewer')
export class EspCompileLogViewer extends LitElement {
  @property({ type: String }) mac = '';
  @state() private logs: string[] = [];
  @state() private autoScroll = true;
  private eventSource: EventSource | null = null;

  private scrollTarget: HTMLElement | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.connect();
  }

  disconnectedCallback(): void {
    this.disconnect();
    super.disconnectedCallback();
  }

  private connect(): void {
    this.disconnect();
    if (!this.mac) return;

    this.eventSource = api.streamCompileLogs(
      this.mac,
      (line: string) => {
        this.logs = [...this.logs, line];
        void this.requestUpdate();
        if (this.autoScroll) {
          requestAnimationFrame(() => this.scrollToBottom());
        }
      },
      () => {
        // SSE will auto-reconnect
      }
    );
  }

  private disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
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
      <div class="log-body" ${(el: Element) => { this.scrollTarget = el as HTMLElement; }}>
        ${this.logs.length === 0
          ? html`<span class="empty">Waiting for build output...</span>`
          : html`<pre>${this.logs.join('\n')}</pre>`}
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      border: 2px solid var(--ink);
      background: #1a1b1e;
    }
    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 10px;
      border-bottom: 1px solid var(--line);
      background: #25262b;
      font-size: 11px;
    }
    .label {
      color: var(--muted);
      font-weight: 900;
      text-transform: uppercase;
    }
    .controls {
      display: flex;
      gap: 4px;
    }
    .ctrl-btn {
      border: 1px solid var(--line);
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-size: 10px;
      padding: 2px 8px;
      cursor: pointer;
    }
    .ctrl-btn:hover,
    .ctrl-btn.active {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
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
