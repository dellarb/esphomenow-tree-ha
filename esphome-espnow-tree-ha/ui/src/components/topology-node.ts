import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { OtaJob, TopologyNode, fmtDuration, normalizeMac } from '../api/client';

@customElement('esp-topology-node')
export class EspTopologyNode extends LitElement {
  @property({ type: Object }) node!: TopologyNode;
  @property({ type: Array }) childNodesData: TopologyNode[] = [];
  @property({ type: Object }) childMap: Map<string, TopologyNode[]> = new Map();
  @property({ attribute: false }) jobForMac: (mac: string) => OtaJob | null = () => null;

  private selectNode(): void {
    this.dispatchEvent(new CustomEvent('node-selected', { detail: this.node.mac, bubbles: true, composed: true }));
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

  @property({ type: Boolean }) isRoot = false;

  render() {
    const job = this.jobForMac(this.node.mac);
    const isActive = !!job && ['starting', 'transferring', 'verifying', 'transfer_success_waiting_rejoin'].includes(job.status);
    const isQueued = !!job && job.status === 'queued';
    const percent = job?.percent ?? 0;
    const nodeContent = html`
      <button class="node ${this.node.online ? 'online' : 'offline'}" @click=${this.selectNode}>
        <span class="status-dot"></span>
        <span class="identity">
          <strong>${this.node.esphome_name || this.node.label || this.node.mac}</strong>
          <small>${this.node.mac}</small>
        </span>
        <span class="metrics">
          <span>${fmtDuration(this.node.uptime_s)}</span>
          <span title="${this.node.rssi == null ? 'No signal' : `${this.node.rssi} dBm`}${(this.node.hops ?? 0) > 0 ? ` | ${this.node.hops} hop${this.node.hops === 1 ? '' : 's'} to bridge` : ''} | ${this.node.route_v2_capable ? 'Supports ESPNOW V2.0 Jumbo Packets' : 'Supports ESPNOW V1.0 Regular Size Packets'}">${this.rssiBars(this.node.rssi)}${(this.node.hops ?? 0) > 0 ? `  ${this.node.hops}↷` : ''}  ${this.node.route_v2_capable ? '🐘' : '🐥'}</span>
          <span>${this.node.chip_name || '-'}</span>
        </span>
        ${isActive
          ? html`<span class="ota-indicator"><span class="spinner"></span><span class="ota-percent">${percent}%</span></span>`
          : isQueued
            ? html`<span class="ota-indicator queued-indicator">⏳ Queued</span>`
            : nothing}
        ${this.node.online ? nothing : html`<span class="offline-note">${fmtDuration(this.node.offline_s)} offline</span>`}
      </button>
    `;

    const childrenHtml = this.childNodesData.length
      ? html`
          <ul>
            ${this.childNodesData.map(
              (child) => html`
                <esp-topology-node
                  .node=${child}
                  .childNodesData=${this.childMap.get(this.childKey(child)) || []}
                  .childMap=${this.childMap}
                  .jobForMac=${this.jobForMac}
                ></esp-topology-node>
              `
            )}
          </ul>
        `
      : nothing;

    return this.isRoot
      ? html`${nodeContent}${childrenHtml}`
      : html`<li>${nodeContent}${childrenHtml}</li>`;
  }

  static styles = css`
    :host {
      display: block;
    }

    :host([is-root]) {
      padding-left: 0;
    }

    ul {
      margin: 0;
      padding: 0 0 0 28px;
      position: relative;
    }

    ul::before {
      content: "";
      position: absolute;
      left: 12px;
      top: 0;
      bottom: 27px;
      width: 2px;
      background: var(--line);
    }

    li {
      list-style: none;
      position: relative;
      margin: 0;
      padding: 6px 0;
    }

    li::before {
      content: "";
      position: absolute;
      left: -16px;
      top: 27px;
      width: 16px;
      height: 2px;
      background: var(--line);
    }

    li:last-child::after {
      content: "";
      position: absolute;
      left: -14px;
      top: 27px;
      bottom: 0;
      width: 6px;
      background: var(--panel-strong);
    }

    .node {
      width: 100%;
      min-height: 54px;
      display: grid;
      grid-template-columns: 16px minmax(180px, 1fr) minmax(280px, auto) auto auto;
      gap: 12px;
      align-items: center;
      border: 2px solid var(--ink);
      background: var(--panel-strong);
      color: var(--ink);
      box-shadow: 4px 4px 0 rgba(32, 33, 31, 0.18);
      padding: 8px 12px;
      text-align: left;
      cursor: pointer;
      font: inherit;
    }

    .node:hover {
      transform: translate(-1px, -1px);
      box-shadow: 5px 5px 0 rgba(32, 33, 31, 0.26);
    }

    .node.offline {
      background: #f4e7e2;
      color: #4b2720;
    }

    .status-dot {
      width: 12px;
      height: 12px;
      border: 2px solid var(--ink);
      background: var(--danger);
    }

    .online .status-dot {
      background: var(--ok);
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
      font-size: 11px;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(68px, auto));
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
      justify-content: end;
    }

    .metrics span,
    .ota-indicator,
    .queued-indicator,
    .offline-note {
      border: 1px solid var(--line);
      background: rgba(255, 252, 245, 0.72);
      padding: 4px 6px;
      white-space: nowrap;
    }

    .ota-indicator {
      border-color: var(--accent);
      color: var(--accent);
      font-weight: 900;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      text-transform: uppercase;
    }

    .queued-indicator {
      border-color: var(--accent-2);
      color: var(--accent-2);
      font-weight: 900;
      font-size: 11px;
      text-transform: uppercase;
    }

    .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid var(--accent);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .ota-percent {
      font-size: 11px;
      font-weight: 900;
    }

    .offline-note {
      color: var(--danger);
      font-weight: 800;
    }

    @media (max-width: 840px) {
      ul {
        padding-left: 14px;
      }
      ul::before,
      li::before,
      li:last-child::after {
        display: none;
      }
      :host([is-root]) {
        padding-left: 0;
      }
      .node {
        grid-template-columns: 16px 1fr;
      }
      .metrics,
      .ota-indicator,
      .queued-indicator,
      .offline-note {
        grid-column: 2;
      }
      .metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        justify-content: stretch;
      }
    }
  `;
}
