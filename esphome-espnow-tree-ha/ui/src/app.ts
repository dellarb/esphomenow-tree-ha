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
          <div class="brand">
            <span class="brand-name">ESP-NOW LR<small>Tree Control</small></span>
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
      --bg: #f5f7fa;
      --surface: #ffffff;
      --ink: #1c1c1e;
      --muted: #64748b;
      --line: #e2e8f0;
      --primary: #0b3b4b;
      --accent: #f39c12;
      --danger: #ef4444;
      --ok: #22c55e;
      --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      display: block;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }

    .app-shell {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--primary);
      color: #fff;
      padding: 0 24px;
      height: 56px;
      border-radius: 12px;
      margin-bottom: 24px;
      box-shadow: var(--shadow);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .brand-name {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }

    .brand-name small {
      font-weight: 400;
      opacity: 0.7;
      font-size: 13px;
      margin-left: 6px;
    }

    .header-right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
    }

    .version {
      color: rgba(255,255,255,0.6);
      font-size: 11px;
      white-space: nowrap;
    }

    nav {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    nav button {
      border: none;
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.8);
      min-height: 36px;
      padding: 0 16px;
      font: inherit;
      font-weight: 500;
      font-size: 14px;
      cursor: pointer;
      border-radius: 8px;
      transition: all 0.15s;
    }

    nav button:hover,
    nav button.active {
      background: rgba(255,255,255,0.18);
      color: #fff;
      font-weight: 600;
    }

    .badge {
      display: inline-block;
      margin-left: 5px;
      padding: 1px 7px;
      font-size: 10px;
      font-weight: 700;
      background: var(--accent);
      color: white;
      border-radius: 10px;
      vertical-align: middle;
    }

    .badge.paused {
      background: var(--muted);
    }

    main {
      max-width: 1100px;
      margin: 0 auto;
    }

    @media (max-width: 720px) {
      .app-shell {
        padding: 12px;
      }
      header {
        flex-wrap: wrap;
        height: auto;
        padding: 12px 16px;
        gap: 8px;
      }
      nav {
        justify-content: flex-start;
      }
    }
  `;
}
