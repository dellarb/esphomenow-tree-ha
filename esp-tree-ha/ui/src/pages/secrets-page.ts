import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { api } from '../api/client';

@customElement('esp-secrets-page')
export class EspSecretsPage extends LitElement {
  @state() private content = '';
  @state() private saved = false;
  @state() private loading = true;
  @state() private error = '';

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading = true;
    try {
      const data = await api.getSecrets();
      this.content = data.content;
      this.error = '';
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.loading = false;
    }
  }

  private async save(): Promise<void> {
    this.saved = false;
    try {
      await api.saveSecrets(this.content);
      this.saved = true;
      this.error = '';
      setTimeout(() => { this.saved = false; this.requestUpdate(); }, 2000);
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private onInput(e: Event): void {
    this.content = (e.target as HTMLTextAreaElement).value;
  }

  private goBack(): void {
    window.location.hash = '/';
  }

  render() {
    return html`
      <button class="back" @click=${this.goBack}>&#8592; Back to topology</button>
      <h2>Secrets</h2>
      ${this.loading
        ? html`<div class="card">Loading...</div>`
        : html`
            <textarea
              class="secrets-textarea"
              .value=${this.content}
              @input=${this.onInput}
              spellcheck="false"
            ></textarea>
            <div class="actions">
              <button class="btn btn-primary" @click=${this.save}>Save</button>
              ${this.saved ? html`<span class="saved">Saved &#10003;</span>` : nothing}
              ${this.error ? html`<span class="error">${this.error}</span>` : nothing}
            </div>
            <div class="warnings">
              <p>&#9888; These secrets are stored in plaintext. Access is protected by Home Assistant ingress authentication.</p>
              <p>&#9888; Missing keys referenced by device configs will cause compile failures.</p>
            </div>
          `}
    `;
  }

  static styles = css`
    :host {
      display: block;
      color: var(--ink);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .back {
      border: 1px solid var(--line);
      background: var(--surface);
      min-height: 36px;
      padding: 0 14px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 16px;
      transition: all 0.12s;
    }
    .back:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 24px;
      font-weight: 700;
    }
    .card {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 20px 24px;
      margin-bottom: 16px;
    }
    .secrets-textarea {
      width: 100%;
      min-height: 300px;
      border: 1px solid var(--line);
      background: #1a1b1e;
      color: #c0c5ce;
      font: inherit;
      font-size: 13px;
      line-height: 1.5;
      padding: 12px;
      resize: vertical;
      border-radius: 8px;
      box-sizing: border-box;
      font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
    }
    .secrets-textarea:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(11,59,75,0.1);
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 12px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
    }
    .btn:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }
    .btn-primary:hover {
      background: #0d4d5e;
    }
    .saved { color: var(--ok); font-weight: 500; font-size: 13px; }
    .error { color: var(--danger); font-weight: 500; font-size: 13px; }
    .warnings {
      margin-top: 16px;
      padding: 10px 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .warnings p { margin: 4px 0; }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'esp-secrets-page': EspSecretsPage;
  }
}
