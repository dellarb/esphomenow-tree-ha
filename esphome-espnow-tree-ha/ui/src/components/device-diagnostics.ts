import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TopologyNode, fmtDuration } from '../api/client';

@customElement('esp-device-diagnostics')
export class EspDeviceDiagnostics extends LitElement {
  @property({ type: Object }) node!: TopologyNode;

  private row(label: string, value: unknown) {
    return html`<div class="metric"><span>${label}</span><strong>${value ?? '-'}</strong></div>`;
  }

  render() {
    return html`
      <section>
        ${this.row('MAC', this.node.mac)}
        ${this.row('Firmware', this.node.firmware_version || this.node.project_version || '-')}
        ${this.row('Project', this.node.project_name || this.node.esphome_name || '-')}
        ${this.row('Build', this.node.firmware_build_date || '-')}
        ${this.row('Chip', this.node.chip_name || '-')}
        ${this.row('RSSI', this.node.rssi == null ? '-' : `${this.node.rssi} dBm`)}
        ${this.row('Hops', this.node.hops ?? 0)}
        ${this.row('Uptime', fmtDuration(this.node.uptime_s))}
        ${this.row('Entities', this.node.entity_count ?? 0)}
      </section>
    `;
  }

  static styles = css`
    section {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }

    .metric {
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.58);
      padding: 10px;
      min-width: 0;
    }

    span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 900;
      margin-bottom: 6px;
    }

    strong {
      display: block;
      overflow-wrap: anywhere;
      font-size: 13px;
    }

    @media (max-width: 760px) {
      section {
        grid-template-columns: 1fr;
      }
    }
  `;
}
