import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { EditorView, basicSetup } from 'codemirror';
import { yaml as yamlLang } from '@codemirror/lang-yaml';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';

function checkYamlWarnings(text: string): string[] {
  const warnings: string[] = [];
  if (/(^|\s)!include\s/m.test(text)) {
    warnings.push('This config uses !include which is not supported. ESPHome compile will fail — only single-file configs are allowed.');
  }
  if (/(^|\s)packages:/m.test(text)) {
    warnings.push('This config uses packages: which is not supported in V1. Each device must be a single YAML file.');
  }
  return warnings;
}

@customElement('esp-config-editor')
export class EspConfigEditor extends LitElement {
  @property({ type: String }) value = '';
  @property({ type: Boolean }) readonly = false;

  private editorView: EditorView | null = null;
  private _resizeObserver: ResizeObserver | null = null;

  disconnectedCallback(): void {
    this.destroyEditor();
    super.disconnectedCallback();
  }

  private destroyEditor(): void {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.editorView) {
      this.editorView.destroy();
      this.editorView = null;
    }
  }

  private initEditor(): void {
    this.destroyEditor();
    const container = this.shadowRoot?.querySelector('.editor-container') as HTMLElement | null;
    if (!container) return;

    const state = EditorState.create({
      doc: this.value,
      extensions: [
        basicSetup,
        yamlLang(),
        oneDark,
        EditorState.readOnly.of(this.readonly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.value = update.state.doc.toString();
            this.dispatchEvent(new CustomEvent('content-change', {
              detail: { content: this.value, warnings: checkYamlWarnings(this.value) },
              bubbles: true,
              composed: true,
            }));
          }
        }),
      ],
    });

    this.editorView = new EditorView({
      state,
      parent: container,
    });

    this._resizeObserver = new ResizeObserver(() => {
      this.editorView?.requestMeasure();
    });
    this._resizeObserver.observe(container);
  }

  updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.has('readonly')) {
      this.initEditor();
    } else if (this.editorView && changedProperties.has('value') && !changedProperties.get('value')) {
      this.initEditor();
    }
  }

  firstUpdated(): void {
    this.initEditor();
  }

  getContent(): string {
    return this.editorView?.state.doc.toString() ?? this.value;
  }

  getWarnings(): string[] {
    return checkYamlWarnings(this.getContent());
  }

  render() {
    return html`<div class="editor-container"></div>`;
  }

  static styles = css`
    :host {
      display: block;
      border: 2px solid var(--ink);
    }
    .editor-container {
      min-height: 400px;
      max-height: 60vh;
      overflow: auto;
      background: #282c34;
    }
    .editor-container .cm-editor {
      height: 100%;
    }
    .editor-container .cm-editor .cm-scroller {
      font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
      font-size: 13px;
      line-height: 1.5;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'esp-config-editor': EspConfigEditor;
  }
}
