import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { ConfigStatus, OtaJob, TopologyNode, fmtDuration, normalizeMac } from '../api/client';

function getOfflineDurationS(node: TopologyNode): number | undefined {
  if (node.offline_s && node.offline_s > 0) {
    return node.offline_s;
  }
  if (!node.online && node.last_seen_ms) {
    return Math.floor((Date.now() - node.last_seen_ms) / 1000);
  }
  return undefined;
}

@customElement('esp-topology-node')
export class EspTopologyNode extends LitElement {
  @property({ type: Object }) node!: TopologyNode;
  @property({ type: Array }) childNodesData: TopologyNode[] = [];
  @property({ type: Object }) childMap: Map<string, TopologyNode[]> = new Map();
  @property({ attribute: false }) jobForMac: (mac: string) => OtaJob | null = () => null;
  @property({ attribute: false }) configForMac: (mac: string) => ConfigStatus | null = () => null;
  @property({ type: Boolean }) isRoot = false;
  @property({ type: Boolean, reflect: true }) isLast = false;

  private selectNode(): void {
    this.dispatchEvent(new CustomEvent('node-selected', { detail: this.node.mac, bubbles: true, composed: true }));
  }

  private navigateTo(path: string): void {
    window.location.hash = path;
  }

  private rssiBars(rssi?: number | null): string {
    if (rssi == null) return '-';
    if (rssi >= -50) return '▂▄▆█';
    if (rssi >= -65) return '▂▄▆';
    if (rssi >= -80) return '▂▄';
    if (rssi >= -90) return '▂';
    return '▁';
  }

  private childKey(node: TopologyNode): string {
    return normalizeMac(node.mac || '');
  }

  render() {
    const job = this.jobForMac(this.node.mac);
    const isActive = !!job && ['starting', 'transferring', 'verifying', 'transfer_success_waiting_rejoin'].includes(job.status);
    const isQueued = !!job && job.status === 'queued';
    const percent = job?.percent ?? 0;
    const hasChildren = this.childNodesData.length > 0;
    const isRemote = (this.node.hops ?? 0) > 0;

    const configStatus = this.configForMac(this.node.mac);
    const configState = configStatus?.config_state ?? 'no_config';

    return html`
      <div class="tree-row">
        <div class="branch ${this.isRoot ? 'root' : ''}" aria-hidden="true"></div>
        <div class="tree-node ${this.node.online ? 'online' : 'offline'}" @click=${this.selectNode}>
          ${isRemote ? html`
            <span class="config-badge config-${configState}">
              ${configState === 'no_config' ? '—' : configState === 'has_config' ? '✓' : configState === 'compiled_ready' ? '↑' : '—'}
            </span>
          ` : html`<span></span>`}
          <span class="status-dot ${this.node.online ? 'online' : 'offline'}"></span>
          <span class="identity">
            <strong>${this.node.friendly_name || this.node.esphome_name || this.node.label || this.node.mac}</strong>
            <small>${this.node.mac}</small>
          </span>
          <span class="metrics">
            <span>${fmtDuration(this.node.uptime_s)}</span>
            ${!this.isRoot ? html`<span title="${this.node.rssi != null ? `${this.node.rssi} dBm` : ''}">${this.rssiBars(this.node.rssi)}${(this.node.hops ?? 0) > 0 ? `  ${this.node.hops}↷` : ''}</span>` : nothing}
            <span>${this.node.chip_name || '-'}</span>
          </span>
          ${isActive
            ? html`<span class="ota-badge">${percent}%</span>`
            : isQueued
              ? html`<span class="ota-badge queued">⏳ Queued #${(job.queue_position ?? 0) + 1}</span>`
              : nothing}
          ${this.node.online ? nothing : html`<span class="offline-note">${this.node.offline_reason || 'offline'}${(() => { const d = getOfflineDurationS(this.node); return d ? ` (${fmtDuration(d)})` : ''; })()}</span>`}
          ${isRemote ? html`
            <span class="action-buttons">
              <button class="icon-btn" title="Edit config" @click=${(e: Event) => { e.stopPropagation(); this.navigateTo(`/device/${encodeURIComponent(this.node.mac)}/config`); }}>&#9998;</button>
              <button class="icon-btn" title="OTA flash" @click=${(e: Event) => { e.stopPropagation(); this.navigateTo(`/device/${encodeURIComponent(this.node.mac)}`); }}>&#128230;</button>
            </span>
          ` : nothing}
        </div>
      </div>
      ${hasChildren
        ? html`
            <div class="tree-child">
              ${this.childNodesData.map(
                (child, i) => html`
                  <esp-topology-node
                    .node=${child}
                    .childNodesData=${this.childMap.get(this.childKey(child)) || []}
                    .childMap=${this.childMap}
                    .jobForMac=${this.jobForMac}
                    .configForMac=${this.configForMac}
                    .isLast=${i === this.childNodesData.length - 1}
                  ></esp-topology-node>
                `
              )}
            </div>
          `
        : nothing}
    `;
  }

  static styles = css`
    :host {
      display: block;
      position: relative;
      margin-left: 22px;
    }

    :host([is-root]) {
      margin-left: 0;
    }

    .tree-row {
      display: flex;
      align-items: stretch;
      position: relative;
      padding: 6px 0;
    }

    .branch {
      position: relative;
      width: 22px;
      flex: 0 0 22px;
      margin-right: 2px;
    }

    .branch.root {
      width: 0;
      flex-basis: 0;
      margin-right: 0;
    }

    /* For last child, stop the vertical line at the horizontal connector */
    :host([is-last])::before {
      display: none;
    }

    /* Don't show continuation line on the root */
    :host([is-root])::before {
      display: none;
    }

    .tree-node {
      width: 100%;
      display: grid;
      grid-template-columns: 14px 10px minmax(180px, 1fr) minmax(280px, auto) auto auto;
      gap: 12px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fafbfc;
      color: var(--ink);
      padding: 12px 14px;
      cursor: pointer;
      font: inherit;
      transition: all 0.12s;
    }

    .tree-node:hover {
      border-color: var(--primary);
      background: #f0f7fa;
    }

    .tree-node.offline {
      background: #fef2f2;
      border-color: #fecaca;
    }

    .tree-node.offline .status-dot {
      background: var(--danger);
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--ok);
    }

    .config-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      font-size: 9px;
      font-weight: 700;
      border: 1px solid var(--line);
      border-radius: 4px;
    }

    .config-badge.config-has_config {
      border-color: var(--ok);
      color: var(--ok);
      background: #dcfce7;
    }

    .config-badge.config-compiled_ready {
      border-color: var(--primary);
      color: var(--primary);
      background: #d5f0f3;
    }

    .config-badge.config-no_config {
      border-color: var(--line);
      color: var(--muted);
    }

    .action-buttons {
      display: flex;
      gap: 4px;
      margin-left: 4px;
    }

    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      padding: 0;
      transition: all 0.12s;
    }

    .icon-btn:hover {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .identity {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      color: var(--muted);
      font-size: 12px;
    }

    .metrics {
      display: flex;
      gap: 8px;
      font-size: 12px;
      color: var(--muted);
    }

    .metrics span {
      background: #f1f5f9;
      padding: 3px 8px;
      border-radius: 6px;
      white-space: nowrap;
    }

    .ota-badge {
      background: var(--primary);
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 6px;
      white-space: nowrap;
    }

    .ota-badge.queued {
      background: var(--accent);
    }

    .offline-note {
      font-size: 12px;
      color: var(--danger);
      font-weight: 500;
    }

    .tree-child {
      position: relative;
      margin-left: 14px;
      padding-left: 0;
    }

    @media (max-width: 840px) {
      :host {
        margin-left: 0;
      }
      .branch {
        display: none;
      }
      .tree-node {
        grid-template-columns: 16px 1fr;
      }
      .metrics,
      .ota-badge,
      .offline-note {
        grid-column: 2;
      }
      .metrics {
        display: flex;
        flex-wrap: wrap;
      }
    }
  `;
}
