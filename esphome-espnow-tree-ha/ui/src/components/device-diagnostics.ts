import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TopologyNode, fmtDuration } from '../api/client';

@customElement('esp-device-diagnostics')
export class EspDeviceDiagnostics extends LitElement {
  @property({ type: Object }) node!: TopologyNode;

  private row(label: string, value: unknown) {
    return html`<div class="metric"><div class="lbl">${label}</div><div class="val">${value ?? '-'}</div></div>`;
  }

  render() {
    return html`
      <div class="diag-grid">
        ${this.row('MAC', this.node.mac)}
        ${this.row('Firmware', this.node.firmware_version || this.node.project_version || '-')}
        ${this.row('Project', this.node.project_name || this.node.esphome_name || '-')}
        ${this.row('Build', this.node.firmware_build_date || '-')}
        ${this.row('Chip', this.node.chip_name || '-')}
        ${this.row('RSSI', this.node.rssi == null ? '-' : `${this.node.rssi} dBm`)}
        ${this.row('Hops', this.node.hops ?? 0)}
        ${this.row('Uptime', fmtDuration(this.node.uptime_s))}
      </div>
    `;
  }

  static styles = css`
    .diag-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .metric {
      background: #f8fafc;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #f1f5f9;
    }

    span {
      display: block;
      color: #94a3b8;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 4px;
    }

    strong {
      display: block;
      overflow-wrap: anywhere;
      font-size: 14px;
      font-weight: 500;
    }

    @media (max-width: 760px) {
      .diag-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
}
