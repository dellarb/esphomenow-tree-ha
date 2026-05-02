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
        ? html`<div class="panel">Loading...</div>`
        : html`
            <textarea
              class="secrets-textarea"
              .value=${this.content}
              @input=${this.onInput}
              spellcheck="false"
            ></textarea>
            <div class="actions">
              <button class="save-btn" @click=${this.save}>Save</button>
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
      font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
    }
    .back {
      border: 2px solid var(--ink);
      background: var(--panel);
      min-height: 36px;
      padding: 0 12px;
      font: inherit;
      font-weight: 900;
      box-shadow: 3px 3px 0 var(--ink);
      cursor: pointer;
      margin-bottom: 12px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: clamp(24px, 4vw, 42px);
    }
    .panel {
      border: 2px solid var(--ink);
      background: var(--panel);
      padding: 14px;
      box-shadow: var(--shadow);
    }
    .secrets-textarea {
      width: 100%;
      min-height: 300px;
      border: 2px solid var(--ink);
      background: #1a1b1e;
      color: #c0c5ce;
      font: inherit;
      font-size: 13px;
      line-height: 1.5;
      padding: 12px;
      resize: vertical;
      box-sizing: border-box;
      font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
    }
    .secrets-textarea:focus {
      outline: none;
      border-color: var(--accent);
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 8px;
    }
    .save-btn {
      border: 2px solid var(--ink);
      background: var(--accent);
      color: white;
      padding: 6px 18px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 3px 3px 0 var(--ink);
    }
    .saved { color: var(--ok); font-weight: 900; font-size: 12px; }
    .error { color: var(--danger); font-weight: 900; font-size: 12px; }
    .warnings {
      margin-top: 16px;
      padding: 10px;
      border: 1px solid var(--line);
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
