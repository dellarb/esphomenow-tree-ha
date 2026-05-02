import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import './components/topology-map';
import './components/device-detail';
import './components/settings';
import './pages/queue-page';
import './pages/config-page';
import './pages/secrets-page';
import { QueueResponse, CompileQueueResponse, api } from './api/client';

declare const __GIT_HASH__: string;
declare const __GIT_DATE__: string;

type Route = { name: 'topology' } | { name: 'device'; mac: string } | { name: 'device-config'; mac: string } | { name: 'settings' } | { name: 'queue' } | { name: 'secrets' };

@customElement('espnow-app')
export class EspnowApp extends LitElement {
  @state() private route: Route = this.readRoute();
  @state() private queueData: QueueResponse | null = null;
  @state() private compileData: CompileQueueResponse | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('hashchange', this.onHashChange);
    this.fetchQueue();
    this.pollTimer = setInterval(() => this.fetchQueue(), 3000);
  }

  disconnectedCallback(): void {
    window.removeEventListener('hashchange', this.onHashChange);
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    super.disconnectedCallback();
  }

  private async fetchQueue(): Promise<void> {
    try {
      const [flash, compile] = await Promise.all([
        api.getQueue(),
        api.getCompileQueue(),
      ]);
      this.queueData = flash;
      this.compileData = compile;
    } catch {
      // ignore poll errors
    }
  }

  private onHashChange = (): void => {
    this.route = this.readRoute();
  };

  private readRoute(): Route {
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (hash.startsWith('device/')) {
      const rest = hash.slice(7);
      if (rest.endsWith('/config')) {
        return { name: 'device-config', mac: decodeURIComponent(rest.replace(/\/config$/, '')) };
      }
      return { name: 'device', mac: decodeURIComponent(rest) };
    }
    if (hash === 'settings') return { name: 'settings' };
    if (hash === 'queue') return { name: 'queue' };
    if (hash === 'secrets') return { name: 'secrets' };
    return { name: 'topology' };
  }

  private navigate(path: string): void {
    window.location.hash = path;
  }

  render() {
    const q = this.queueData;
    const cq = this.compileData;
    const queueCount = q?.count ?? 0;
    const compileCount = cq?.count ?? 0;
    const hasActive = !!q?.active_job && !['success', 'failed', 'aborted', 'rejoin_timeout', 'version_mismatch'].includes(q.active_job.status);
    const hasCompileActive = !!cq?.active_job;
    const paused = q?.paused ?? false;
    const showBadge = hasActive || queueCount > 0 || hasCompileActive || compileCount > 0;

    return html`
      <div class="app-shell">
        <header>
          <div>
            <p class="eyebrow">ESP-NOW LR</p>
            <h1>Tree Control</h1>
          </div>
          <div class="header-right">
            <nav>
              <button class=${this.route.name === 'topology' ? 'active' : ''} @click=${() => this.navigate('/')}>Topology</button>
              <button class=${this.route.name === 'queue' ? 'active' : ''} @click=${() => this.navigate('/queue')}>
                Queue${showBadge ? html`<span class="badge ${paused ? 'paused' : ''}">${paused ? '⏸' : ''}${hasCompileActive || hasActive ? '1' : '0'}/${queueCount + compileCount}</span>` : nothing}
              </button>
              <button class=${this.route.name === 'settings' ? 'active' : ''} @click=${() => this.navigate('/settings')}>Settings</button>
            </nav>
            <span class="version">${__GIT_HASH__ !== 'unknown' ? `${__GIT_HASH__} · ${new Date(__GIT_DATE__).toLocaleString()}` : 'dev'}</span>
          </div>
        </header>
        <main>
          ${this.route.name === 'topology'
            ? html`<esp-topology-map @node-selected=${(event: CustomEvent<string>) => this.navigate(`/device/${encodeURIComponent(event.detail)}`)}></esp-topology-map>`
            : this.route.name === 'device'
              ? html`<esp-device-detail .mac=${this.route.mac}></esp-device-detail>`
              : this.route.name === 'device-config'
                ? html`<esp-config-page .mac=${this.route.mac}></esp-config-page>`
                : this.route.name === 'queue'
                  ? html`<esp-queue-page></esp-queue-page>`
                  : this.route.name === 'secrets'
                    ? html`<esp-secrets-page></esp-secrets-page>`
                    : html`<esp-settings></esp-settings>`}
        </main>
      </div>
    `;
  }

  static styles = css`
    :host {
      --bg: #ffffff;
      --ink: #20211f;
      --muted: #6c6b65;
      --line: #d6d0c5;
      --panel: #fffcf5;
      --panel-strong: #ffffff;
      --accent: #087f8c;
      --accent-2: #d97706;
      --danger: #b42318;
      --ok: #15803d;
      --shadow: 0 18px 44px rgba(32, 33, 31, 0.12);
      display: block;
      min-height: 100vh;
      background:
        linear-gradient(90deg, rgba(32, 33, 31, 0.04) 1px, transparent 1px) 0 0 / 28px 28px,
        linear-gradient(rgba(32, 33, 31, 0.035) 1px, transparent 1px) 0 0 / 28px 28px,
        var(--bg);
      color: var(--ink);
      font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
    }

    .app-shell {
      min-height: 100vh;
      padding: 18px;
    }

    header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 16px;
      max-width: 1220px;
      margin: 0 auto 18px;
      border-bottom: 2px solid var(--ink);
      padding-bottom: 14px;
    }

    .header-right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }

    .version {
      color: var(--muted);
      font-size: 11px;
      white-space: nowrap;
    }

    h1 {
      margin: 0;
      font-size: clamp(28px, 4vw, 54px);
      line-height: 0.95;
      letter-spacing: 0;
    }

    .eyebrow {
      margin: 0 0 4px;
      color: var(--accent);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }

    nav {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    button {
      border: 2px solid var(--ink);
      background: var(--panel);
      color: var(--ink);
      min-height: 38px;
      padding: 0 14px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 3px 3px 0 var(--ink);
    }

    button:hover,
    button.active {
      background: var(--accent);
      color: white;
    }

    .badge {
      display: inline-block;
      margin-left: 4px;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 900;
      background: var(--accent);
      color: white;
      border-radius: 3px;
      vertical-align: middle;
    }

    .badge.paused {
      background: var(--accent-2);
    }

    main {
      max-width: 1220px;
      margin: 0 auto;
    }

    @media (max-width: 720px) {
      .app-shell {
        padding: 12px;
      }
      header {
        align-items: stretch;
        flex-direction: column;
      }
      nav {
        justify-content: flex-start;
      }
    }
  `;
}
