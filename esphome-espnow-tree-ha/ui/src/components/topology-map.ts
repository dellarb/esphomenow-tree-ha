import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ConfigStatus, OtaJob, QueueResponse, TopologyNode, api, normalizeMac } from '../api/client';
import './topology-node';

@customElement('esp-topology-map')
export class EspTopologyMap extends LitElement {
  @state() private topology: TopologyNode[] = [];
  @state() private currentJob: OtaJob | null = null;
  @state() private queueData: QueueResponse | null = null;
  @state() private configStatuses: Map<string, ConfigStatus> = new Map();
  @state() private loading = true;
  @state() private error = '';
  private timer: number | undefined;

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
    this.timer = window.setInterval(() => void this.load(false), 5000);
  }

  disconnectedCallback(): void {
    if (this.timer) window.clearInterval(this.timer);
    super.disconnectedCallback();
  }

  private async load(showLoading = true): Promise<void> {
    if (showLoading) this.loading = true;
    try {
      const [topology, current, queue] = await Promise.all([api.topology(), api.currentOta(), api.getQueue()]);
      this.topology = topology;
      this.currentJob = current.job;
      this.queueData = queue;
      this.error = '';

      const configPromises = topology
        .filter((n) => (n.hops ?? 0) > 0)
        .map((n) => api.getConfigStatus(n.mac).catch(() => null));
      const results = await Promise.all(configPromises);
      const cs = new Map<string, ConfigStatus>();
      results.forEach((r) => {
        if (r) cs.set(normalizeMac(r.mac), r);
      });
      this.configStatuses = cs;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
    }
  }

  private jobForMac(mac: string): OtaJob | null {
    const nm = normalizeMac(mac);
    if (this.currentJob && normalizeMac(this.currentJob.mac) === nm) return this.currentJob;
    const queued = this.queueData?.queued_jobs ?? [];
    return queued.find(j => normalizeMac(j.mac) === nm) ?? null;
  }

  private configForMac(mac: string): ConfigStatus | null {
    return this.configStatuses.get(normalizeMac(mac)) ?? null;
  }

  private childKey(value?: string): string {
    return normalizeMac(value || '');
  }

  private buildChildren(): { root: TopologyNode | null; childMap: Map<string, TopologyNode[]> } {
    const childMap = new Map<string, TopologyNode[]>();
    for (const node of this.topology) {
      const parent = this.childKey(node.parent_mac);
      if (!parent) continue;
      const children = childMap.get(parent) || [];
      children.push(node);
      childMap.set(parent, children);
    }
    for (const children of childMap.values()) {
      children.sort((a, b) => (a.friendly_name || a.label || a.esphome_name || a.mac).localeCompare(b.friendly_name || b.label || b.esphome_name || b.mac));
    }
    const root = this.topology.find((node) => (node.hops ?? 0) === 0) || this.topology.find((node) => !node.parent_mac) || this.topology[0] || null;
    return { root, childMap };
  }

  render() {
    const onlineCount = this.topology.filter((node) => node.online).length;
    const remoteCount = Math.max(0, this.topology.length - 1);
    const { root, childMap } = this.buildChildren();
    return html`
      <section class="summary">
        <div class="summary-card">
          <div class="num">${onlineCount}</div>
          <p>online nodes</p>
        </div>
        <div class="summary-card">
          <div class="num">${remoteCount}</div>
          <p>remotes</p>
        </div>
        <div class="summary-card">
          <div class="num">${this.currentJob ? (this.currentJob.status === 'transferring' ? 'UPDATING FIRMWARE' : this.currentJob.status.replaceAll('_', ' ')) : (this.queueData && this.queueData.count > 0 ? `${this.queueData.count} QUEUED` : 'idle')}</div>
          <p>OTA state</p>
        </div>
      </section>

      ${this.error ? html`<div class="error">${this.error}</div>` : nothing}
      ${this.loading ? html`<div class="loading">Reading bridge topology...</div>` : nothing}
      ${!this.loading && !root && !this.error ? html`<div class="loading">No topology data returned by the bridge.</div>` : nothing}
      ${root
        ? html`
            <section class="card">
              <div class="card-header">
                <h2>${root.friendly_name || root.label || root.esphome_name || 'Bridge'} Topology</h2>
                <button class="btn" @click=${() => void this.load()}>Refresh</button>
              </div>
              <div class="card-body">
                <div class="tree-root">
                  <esp-topology-node
                    .node=${root}
                    .childNodesData=${childMap.get(this.childKey(root.mac)) || []}
                    .childMap=${childMap}
                    .jobForMac=${(mac: string) => this.jobForMac(mac)}
                    .configForMac=${(mac: string) => this.configForMac(mac)}
                    .isRoot=${true}
                  ></esp-topology-node>
                </div>
              </div>
            </section>
          `
        : nothing}
    `;
  }

  static styles = css`
    .summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    .summary-card {
      background: var(--surface);
      border-radius: 12px;
      padding: 20px 24px;
      box-shadow: var(--shadow);
      border: 1px solid var(--line);
    }

    .summary-card .num {
      font-size: 32px;
      font-weight: 700;
      color: var(--primary);
      line-height: 1.2;
    }

    .summary-card p {
      font-size: 13px;
      color: var(--muted);
      margin-top: 4px;
      font-weight: 500;
    }

    .card {
      background: var(--surface);
      border-radius: 12px;
      box-shadow: var(--shadow);
      border: 1px solid var(--line);
      margin-bottom: 20px;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--line);
    }

    .card-header h2 {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }

    .card-body {
      padding: 16px 20px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 5px 10px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
      min-height: 32px;
    }

    .btn:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    .tree-root {
      margin: 0;
      padding: 0;
      overflow: hidden;
    }

    .error,
    .loading {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
      color: var(--muted);
      font-size: 14px;
    }

    .error {
      border-color: var(--danger);
      color: var(--danger);
      background: #fef2f2;
    }

    @media (max-width: 720px) {
      .summary {
        grid-template-columns: 1fr;
      }
    }
  `;
}
