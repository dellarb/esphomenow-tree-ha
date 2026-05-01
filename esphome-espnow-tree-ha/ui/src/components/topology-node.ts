import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { OtaJob, TopologyNode, fmtDuration, normalizeMac } from '../api/client';

@customElement('esp-topology-node')
export class EspTopologyNode extends LitElement {
  @property({ type: Object }) node!: TopologyNode;
  @property({ type: Array }) childNodesData: TopologyNode[] = [];
  @property({ type: Object }) childMap: Map<string, TopologyNode[]> = new Map();
  @property({ type: Object }) activeJob: OtaJob | null = null;

  private selectNode(): void {
    this.dispatchEvent(new CustomEvent('node-selected', { detail: this.node.mac, bubbles: true, composed: true }));
  }

  private childKey(node: TopologyNode): string {
    return normalizeMac(node.mac || '');
  }

  render() {
    const activeForNode = this.activeJob && normalizeMac(this.activeJob.mac) === normalizeMac(this.node.mac);
    return html`
      <li>
        <button class="node ${this.node.online ? 'online' : 'offline'}" @click=${this.selectNode}>
          <span class="status-dot"></span>
          <span class="identity">
            <strong>${this.node.esphome_name || this.node.label || this.node.mac}</strong>
            <small>${this.node.mac}</small>
          </span>
          <span class="metrics">
            <span>${this.node.hops ?? 0} hop${(this.node.hops ?? 0) === 1 ? '' : 's'}</span>
            <span>${this.node.rssi == null ? '-' : `${this.node.rssi} dBm`}</span>
            <span title="${this.node.route_v2_capable ? 'Supports ESPNOW V2.0 Jumbo Packets' : 'Supports ESPNOW V1.0 Regular Size Packets'}">${this.node.route_v2_capable ? '🐘' : '🐥'}</span>
            <span>${this.node.chip_name || '-'}</span>
          </span>
          ${activeForNode ? html`<span class="ota-badge">${this.activeJob?.status === 'transferring' ? 'UPDATING FIRMWARE' : this.activeJob?.status.replaceAll('_', ' ')}</span>` : nothing}
          ${this.node.online ? nothing : html`<span class="offline-note">${fmtDuration(this.node.offline_s)} offline</span>`}
        </button>
        ${this.childNodesData.length
          ? html`
              <ul>
                ${this.childNodesData.map(
                  (child) => html`
                    <esp-topology-node
                      .node=${child}
                      .childNodesData=${this.childMap.get(this.childKey(child)) || []}
                      .childMap=${this.childMap}
                      .activeJob=${this.activeJob}
                    ></esp-topology-node>
                  `
                )}
              </ul>
            `
          : nothing}
      </li>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }

    li {
      list-style: none;
      position: relative;
      margin: 0;
      padding: 0 0 0 24px;
    }

    li::before {
      content: "";
      position: absolute;
      left: 6px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--line);
    }

    li::after {
      content: "";
      position: absolute;
      left: 6px;
      top: 27px;
      width: 18px;
      height: 2px;
      background: var(--line);
    }

    ul {
      margin: 8px 0 0;
      padding: 0;
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
      grid-template-columns: repeat(4, minmax(68px, auto));
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
      justify-content: end;
    }

    .metrics span,
    .ota-badge,
    .offline-note {
      border: 1px solid var(--line);
      background: rgba(255, 252, 245, 0.72);
      padding: 4px 6px;
      white-space: nowrap;
    }

    .ota-badge {
      border-color: var(--accent-2);
      color: var(--accent-2);
      font-weight: 900;
      text-transform: uppercase;
    }

    .offline-note {
      color: var(--danger);
      font-weight: 800;
    }

    @media (max-width: 840px) {
      li {
        padding-left: 14px;
      }
      li::before,
      li::after {
        display: none;
      }
      .node {
        grid-template-columns: 16px 1fr;
      }
      .metrics,
      .ota-badge,
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
