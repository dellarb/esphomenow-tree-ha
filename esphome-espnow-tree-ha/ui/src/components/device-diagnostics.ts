import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TopologyNode, fmtDuration } from '../api/client';

function fmtMd5(md5: string | undefined): string {
  if (!md5) return '-';
  return md5.slice(0, 4) + '...' + md5.slice(-4);
}

@customElement('esp-device-diagnostics')
export class EspDeviceDiagnostics extends LitElement {
  @property({ type: Object }) node!: TopologyNode;

  private row(label: string, value: unknown) {
    return html`<div class="metric"><div class="lbl">${label}</div><div class="val">${value ?? '-'}</div></div>`;
  }

  render() {
    const md5 = this.node.firmware_md5;
    return html`
      <div class="diag-grid">
        ${this.row('MAC', this.node.mac)}
        ${this.row('Firmware', this.node.firmware_version || this.node.project_version || '-')}
        ${this.row('Project', this.node.project_name || this.node.esphome_name || '-')}
        ${this.row('Build', this.node.firmware_build_date || '-')}
        <div class="metric">
          <div class="lbl">Firmware MD5</div>
          ${md5 ? html`
            <div class="val mono" title="Click to copy: ${md5}" style="cursor:pointer"
                 @click=${() => navigator.clipboard.writeText(md5)}>
              ${fmtMd5(md5)}
            </div>` : html`<div class="val">-</div>`}
        </div>
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

    .metric .lbl {
      display: block;
      color: #94a3b8;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .metric .val {
      display: block;
      overflow-wrap: anywhere;
      font-size: 14px;
      font-weight: 500;
    }

    .metric .val.mono {
      font-family: monospace;
      font-size: 14px;
      color: #64748b;
    }

    .metric .val.mono:hover {
      color: #0b3b4b;
    }

    @media (max-width: 760px) {
      .diag-grid {
        grid-template-columns: 1fr;
      }
    }
  `;
}
