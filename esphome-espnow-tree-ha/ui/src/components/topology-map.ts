import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ConfigStatus, OtaJob, QueueResponse, TopologyNode, api, normalizeMac, streamTopology, TopologyStreamHandle, WsTopologyMessage } from '../api/client';
import './topology-node';

@customElement('esp-topology-map')
export class EspTopologyMap extends LitElement {
  @state() private topology: TopologyNode[] = [];
  @state() private currentJob: OtaJob | null = null;
  @state() private queueData: QueueResponse | null = null;
  @state() private configStatuses: Map<string, ConfigStatus> = new Map();
  @state() private loading = true;
  @state() private error = '';
  @state() private hiddenExpanded = false;
  private stream: TopologyStreamHandle | undefined;

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
    this.stream = streamTopology((msg: WsTopologyMessage) => {
      if (msg.type === 'topology.snapshot' || msg.type === 'topology.changed' || msg.type === 'remote.availability' || msg.type === 'bridge.heartbeat') {
        void this.load(false, true);
      }
    });
  }

  disconnectedCallback(): void {
    this.stream?.close();
    super.disconnectedCallback();
  }

  private async load(showLoading = true, bypassCache = false): Promise<void> {
    if (showLoading) this.loading = true;
    try {
      const [topology, current, queue] = await Promise.all([api.topology(bypassCache), api.currentOta(), api.getQueue()]);
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

  private async handleHideDevice(mac: string): Promise<void> {
    try {
      await api.hideDevice(mac);
      await this.load(false, true);
    } catch (err) {
      console.error('Failed to hide device:', err);
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
    const { root } = this.buildChildren();
    const visibleTopology = this.topology.filter((n) => !n.hidden && (n.hops ?? 0) > 0);
    const hiddenDevices = this.topology.filter((n) => n.hidden);

    const visibleChildMap = new Map<string, TopologyNode[]>();
    for (const node of visibleTopology) {
      const parent = this.childKey(node.parent_mac);
      if (!parent) continue;
      const children = visibleChildMap.get(parent) || [];
      children.push(node);
      visibleChildMap.set(parent, children);
    }
    for (const children of visibleChildMap.values()) {
      children.sort((a, b) => (a.friendly_name || a.label || a.esphome_name || a.mac).localeCompare(b.friendly_name || b.label || b.esphome_name || b.mac));
    }

    return html`
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
                    .childNodesData=${visibleChildMap.get(this.childKey(root.mac)) || []}
                    .childMap=${visibleChildMap}
                    .jobForMac=${(mac: string) => this.jobForMac(mac)}
                    .configForMac=${(mac: string) => this.configForMac(mac)}
                    .onHideDevice=${(mac: string) => this.handleHideDevice(mac)}
                    .isRoot=${true}
                  ></esp-topology-node>
                </div>
              </div>
            </section>
          `
        : nothing}
      ${hiddenDevices.length > 0
        ? html`
            <section class="card hidden-section">
              <div class="card-header collapsible" @click=${() => { this.hiddenExpanded = !this.hiddenExpanded; }}>
                <h2>Hidden Devices (${hiddenDevices.length})</h2>
                <span class="expand-icon">${this.hiddenExpanded ? '▼' : '▶'}</span>
              </div>
              ${this.hiddenExpanded
                ? html`
                    <div class="card-body">
                      <div class="hidden-devices">
                        ${hiddenDevices.map((node) => html`
                          <div class="hidden-device-row">
                            <span class="status-dot offline"></span>
                            <span class="device-name">${node.friendly_name || node.esphome_name || node.label || node.mac}</span>
                            <span class="device-mac">${node.mac}</span>
                            <span class="device-status">${node.offline_reason || 'offline'}</span>
                          </div>
                        `)}
                      </div>
                    </div>
                  `
                : nothing}
            </section>
          `
        : nothing}
    `;
  }

  static styles = css`
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
      padding: 16px 10px;
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

    .hidden-section {
      margin-top: 0;
    }

    .hidden-section .card-header {
      cursor: pointer;
      user-select: none;
    }

    .hidden-section .card-header:hover {
      background: #f8fafc;
    }

    .expand-icon {
      font-size: 12px;
      color: var(--muted);
    }

    .hidden-devices {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .hidden-device-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      font-size: 13px;
    }

    .hidden-device-row .status-dot {
      flex-shrink: 0;
    }

    .hidden-device-row .device-name {
      flex: 1;
      font-weight: 500;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hidden-device-row .device-mac {
      color: var(--muted);
      font-size: 12px;
    }

    .hidden-device-row .device-status {
      color: var(--danger);
      font-size: 12px;
    }

    @media (max-width: 720px) {
      .summary {
        display: none;
      }

      .card {
        margin-bottom: 14px;
      }

      .card-header {
        align-items: flex-start;
        gap: 12px;
        flex-direction: column;
        padding: 14px 16px;
      }

      .card-header h2 {
        font-size: 15px;
      }

      .card-body {
        padding: 12px 14px;
      }
    }
  `;
}
