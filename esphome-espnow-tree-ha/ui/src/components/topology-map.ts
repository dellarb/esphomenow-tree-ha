import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { OtaJob, TopologyNode, api, normalizeMac } from '../api/client';
import './topology-node';

@customElement('esp-topology-map')
export class EspTopologyMap extends LitElement {
  @state() private topology: TopologyNode[] = [];
  @state() private currentJob: OtaJob | null = null;
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
      const [topology, current] = await Promise.all([api.topology(), api.currentOta()]);
      this.topology = topology;
      this.currentJob = current.job;
      this.error = '';
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
    }
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
      children.sort((a, b) => (a.label || a.esphome_name || a.mac).localeCompare(b.label || b.esphome_name || b.mac));
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
        <div>
          <span>${onlineCount}</span>
          <p>online nodes</p>
        </div>
        <div>
          <span>${remoteCount}</span>
          <p>remotes</p>
        </div>
        <div>
          <span>${this.currentJob ? this.currentJob.status.replaceAll('_', ' ') : 'idle'}</span>
          <p>OTA state</p>
        </div>
      </section>

      ${this.error ? html`<div class="error">${this.error}</div>` : nothing}
      ${this.loading ? html`<div class="loading">Reading bridge topology...</div>` : nothing}
      ${!this.loading && !root && !this.error ? html`<div class="loading">No topology data returned by the bridge.</div>` : nothing}
      ${root
        ? html`
            <section class="tree-panel">
              <div class="panel-title">
                <h2>${root.label || root.esphome_name || 'Bridge'} Topology</h2>
                <button @click=${() => void this.load()}>Refresh</button>
              </div>
              <ul class="tree-root">
                <esp-topology-node
                  .node=${root}
                  .childNodesData=${childMap.get(this.childKey(root.mac)) || []}
                  .childMap=${childMap}
                  .activeJob=${this.currentJob}
                ></esp-topology-node>
              </ul>
            </section>
          `
        : nothing}
    `;
  }

  static styles = css`
    .summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }

    .summary div,
    .tree-panel,
    .error,
    .loading {
      border: 2px solid var(--ink);
      background: var(--panel);
      box-shadow: var(--shadow);
    }

    .summary div {
      padding: 14px;
    }

    .summary span {
      display: block;
      font-size: 28px;
      font-weight: 900;
    }

    .summary p {
      margin: 4px 0 0;
      color: var(--muted);
      text-transform: uppercase;
      font-size: 12px;
      font-weight: 800;
    }

    .tree-panel {
      padding: 14px;
    }

    .panel-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    h2 {
      margin: 0;
      font-size: 20px;
    }

    button {
      border: 2px solid var(--ink);
      background: var(--accent);
      color: white;
      min-height: 34px;
      padding: 0 12px;
      box-shadow: 3px 3px 0 var(--ink);
      font: inherit;
      font-weight: 900;
      cursor: pointer;
    }

    .tree-root {
      margin: 0;
      padding: 0;
    }

    .error,
    .loading {
      padding: 16px;
      margin-bottom: 14px;
    }

    .error {
      border-color: var(--danger);
      color: var(--danger);
      background: #fff1ed;
    }

    @media (max-width: 720px) {
      .summary {
        grid-template-columns: 1fr;
      }
    }
  `;
}
