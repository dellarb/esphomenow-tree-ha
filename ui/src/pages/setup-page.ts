import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { DiscoveredBridge, api } from '../api/client';

type Step1State = 'disabled' | 'scanning' | 'found' | 'connecting' | 'pending' | 'complete' | 'error';
type Step2State = 'disabled' | 'ready' | 'restarting' | 'polling' | 'complete' | 'error';
type Step3State = 'disabled' | 'triggering' | 'polling' | 'complete' | 'fallback' | 'error';

@customElement('esp-setup-wizard')
export class EspSetupWizard extends LitElement {
  @state() private step1: Step1State = 'scanning';
  @state() private step2: Step2State = 'disabled';
  @state() private step3: Step3State = 'disabled';
  @state() private discoveredBridges: DiscoveredBridge[] = [];
  @state() private bridgeError: string | null = null;
  @state() private manualMode = false;
  @state() private manualHost = '';
  @state() private manualPort = 80;
  @state() private manualApiKey = '';
  @state() private apiKeyInput = '';
  @state() private selectedBridge: DiscoveredBridge | null = null;
  @state() private restartError: string | null = null;
  @state() private integrationError: string | null = null;
  @state() private runningIntegrationVersion: string | null = null;
  @state() private latestIntegrationVersion: string | null = null;
  @state() private bridgeApiStatus: string | null = null;
  @state() private statusPollTimer: ReturnType<typeof setInterval> | null = null;
  @state() private integrationPollTimer: ReturnType<typeof setInterval> | null = null;
  @state() private integrationFailures = 0;
  @state() private pollingSeconds = 0;
  private discoveryTimer: ReturnType<typeof setInterval> | null = null;
  private doneTimer: ReturnType<typeof setTimeout> | null = null;
  private validatePollTimer: ReturnType<typeof setInterval> | null = null;
  private validateAttempts = 0;
  private activeBridgeUuid: string | null = null;
  private bridgeHost: string | null = null;
  private bridgePort = 80;

  connectedCallback(): void {
    super.connectedCallback();
    void this.initFromBridgeConfig();
  }

  private async initFromBridgeConfig(): Promise<void> {
    const status = await api.setupStatus();
    this.captureStatus(status);
    const integrationReady = this.integrationReady(status);

    if (status.bridge.configured) {
      this.activeBridgeUuid = status.bridge.uuid || null;
      this.bridgeHost = status.bridge.ip || null;
      if (status.bridge.connected) {
        this.step1 = 'complete';
        void this.startConfiguredBridgeFlow(status, integrationReady);
      } else {
        this.step1 = 'pending';
        this.validateAttempts = 0;
        if (this.discoveryTimer) {
          clearInterval(this.discoveryTimer);
          this.discoveryTimer = null;
        }
        if (this.activeBridgeUuid) {
          void api.bridgeReconnect(this.activeBridgeUuid);
        }
        this.validatePollTimer = setInterval(() => void this.pollValidateStatus(), 1000);
      }
    } else {
      if (this.step2 !== 'disabled') this.step2 = 'disabled';
      if (this.step3 !== 'disabled') this.step3 = 'disabled';
      void this.startDiscovery();
      this.statusPollTimer = setInterval(() => void this.pollStatus(), 3000);
    }
  }

  private async startConfiguredBridgeFlow(status: Awaited<ReturnType<typeof api.setupStatus>>, integrationReady: boolean): Promise<void> {
    if (status.restart.required) {
      if (!['restarting', 'polling', 'complete'].includes(this.step2)) this.step2 = 'ready';
    } else {
      this.step2 = 'complete';
      if (integrationReady) {
        this.step3 = 'complete';
        void this.onAllDone();
      } else if (this.step3 === 'disabled') {
        void this.triggerIntegrationSetup();
      }
    }
    this.statusPollTimer = setInterval(() => void this.pollStatus(), 3000);
  }

  private async pollValidateStatus(): Promise<void> {
    if (this.step1 !== 'pending') {
      if (this.validatePollTimer) {
        clearInterval(this.validatePollTimer);
        this.validatePollTimer = null;
      }
      return;
    }
    this.validateAttempts++;
    try {
      const status = await api.setupStatus();
      this.captureStatus(status);
      if (status.bridge.connected) {
        this.step1 = 'complete';
        if (this.validatePollTimer) {
          clearInterval(this.validatePollTimer);
          this.validatePollTimer = null;
        }
        void this.startConfiguredBridgeFlow(status, this.integrationReady(status));
        return;
      }
    } catch {
      // ignore
    }
    if (this.validateAttempts >= 3) {
      if (this.validatePollTimer) {
        clearInterval(this.validatePollTimer);
        this.validatePollTimer = null;
      }
      this.step1 = 'error';
      void this.startDiscovery();
      this.statusPollTimer = setInterval(() => void this.pollStatus(), 3000);
    }
  }

  disconnectedCallback(): void {
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }
    if (this.integrationPollTimer) {
      clearInterval(this.integrationPollTimer);
      this.integrationPollTimer = null;
    }
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    if (this.validatePollTimer) {
      clearInterval(this.validatePollTimer);
      this.validatePollTimer = null;
    }
    if (this.doneTimer) {
      clearTimeout(this.doneTimer);
      this.doneTimer = null;
    }
    super.disconnectedCallback();
  }

  private async startDiscovery(): Promise<void> {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    if (this.step1 !== 'complete') this.step1 = 'scanning';
    this.bridgeError = null;
    await this.refreshDiscoveredBridges();
    void api.triggerScan().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes('already')) {
        this.bridgeError = msg;
      }
    });
    this.discoveryTimer = setInterval(() => void this.refreshDiscoveredBridges(), 2000);
  }

  private async refreshDiscoveredBridges(): Promise<void> {
    if (this.step1 === 'complete' || this.step1 === 'connecting' || this.step1 === 'pending') return;
    try {
      this.discoveredBridges = await api.discoverBridges();
      if (this.discoveredBridges.length > 0) {
        this.step1 = 'found';
        this.bridgeError = null;
      } else if (this.step1 !== 'error') {
        this.step1 = 'scanning';
      }
    } catch (e) {
      this.bridgeError = e instanceof Error ? e.message : String(e);
    }
  }

  private async pollStatus(): Promise<void> {
    try {
      const status = await api.setupStatus();
      this.captureStatus(status);
      const integrationReady = this.integrationReady(status);

      if (status.bridge.configured && this.step1 !== 'pending') {
        this.step1 = 'complete';
        if (this.discoveryTimer) {
          clearInterval(this.discoveryTimer);
          this.discoveryTimer = null;
        }
        if (status.restart.required) {
          if (!['restarting', 'polling', 'complete'].includes(this.step2)) this.step2 = 'ready';
        } else {
          this.step2 = 'complete';
          if (!integrationReady && this.step3 === 'disabled') {
            void this.triggerIntegrationSetup();
          }
        }
      } else {
        if (this.step2 !== 'disabled') this.step2 = 'disabled';
        if (this.step3 !== 'disabled') this.step3 = 'disabled';
      }

      if (status.bridge.configured && !status.restart.required && this.step2 === 'polling') {
        this.step2 = 'complete';
        this.pollingSeconds = 0;
        if (!integrationReady && this.step3 === 'disabled') {
          void this.triggerIntegrationSetup();
        }
      }

      if (integrationReady) {
        this.step3 = 'complete';
        this.integrationFailures = 0;
        if (this.step1 === 'complete' && this.step2 === 'complete') void this.onAllDone();
      }

      if (this.step2 === 'polling') {
        this.pollingSeconds += 3;
      }
    } catch {
      // API unreachable — expected during restart polling, step2 handles it
    }
  }

  private captureStatus(status: Awaited<ReturnType<typeof api.setupStatus>>): void {
    this.runningIntegrationVersion = status.restart.running_version || status.integration.version || null;
    this.latestIntegrationVersion = status.restart.latest_version || status.integration.latest_version || null;
    if (status.bridge.api_connected) {
      const label = status.bridge.name || status.bridge.mac || status.bridge.ip || 'bridge';
      this.bridgeApiStatus = `Bridge API online: ${label}`;
    } else if (status.bridge.error) {
      this.bridgeApiStatus = `Bridge API unavailable: ${status.bridge.error}`;
    }
  }

  private integrationReady(status: Awaited<ReturnType<typeof api.setupStatus>>): boolean {
    return Boolean(status.integration.configured || status.integration.loaded || status.integration.entry_loaded);
  }

  private async connectBridgeBySelect(bridge: DiscoveredBridge): Promise<void> {
    if (!this.apiKeyInput.trim()) {
      this.bridgeError = 'API key is required';
      return;
    }
    this.step1 = 'connecting';
    this.bridgeError = null;
    try {
      await api.selectBridge(
        bridge.host, bridge.port, bridge.name, bridge.version,
        this.apiKeyInput, bridge.network_id, bridge.hostname,
      );
      this.step1 = 'complete';
      this.step2 = 'ready';
      void this.pollStatus();
    } catch (e) {
      this.step1 = 'found';
      this.bridgeError = e instanceof Error ? e.message : String(e);
    }
  }

  private async connectManualBridge(): Promise<void> {
    if (!this.manualHost.trim()) {
      this.bridgeError = 'Host is required';
      return;
    }
    this.step1 = 'connecting';
    this.bridgeError = null;
    try {
      await api.addBridge(this.manualHost.trim(), this.manualPort, undefined, this.manualApiKey || '', '');
      this.step1 = 'complete';
      this.step2 = 'ready';
      void this.pollStatus();
    } catch (e) {
      this.step1 = this.discoveredBridges.length > 0 ? 'found' : 'error';
      this.bridgeError = e instanceof Error ? e.message : String(e);
    }
  }

  private selectBridgeForApiKey(bridge: DiscoveredBridge): void {
    this.selectedBridge = bridge;
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
  }

  private async handleRestart(): Promise<void> {
    this.step2 = 'restarting';
    this.restartError = null;
    try {
      const result = await api.requestRestart();
      if (result.success) {
        this.step2 = 'polling';
        this.pollingSeconds = 0;
      } else {
        this.step2 = 'error';
        this.restartError = result.error || 'Restart failed';
      }
    } catch (e) {
      this.step2 = 'polling';
      this.pollingSeconds = 0;
      this.restartError = null;
    }
  }

  private async triggerIntegrationSetup(): Promise<void> {
    if (['triggering', 'polling', 'complete'].includes(this.step3)) return;
    this.step3 = 'triggering';
    this.integrationError = null;
    this.integrationFailures = 0;
    try {
      const result = await api.integrationSetup();
      if (result.entry_created) {
        this.step3 = 'complete';
        void this.onAllDone();
        return;
      }
      if (result.success) {
        this.step3 = 'polling';
        if (!this.integrationPollTimer) {
          this.integrationPollTimer = setInterval(() => void this.pollIntegrationForEntry(), 3000);
        }
      } else {
        this.step3 = 'error';
        this.integrationError = result.error || 'Failed to set up integration';
      }
    } catch (e) {
      this.step3 = 'error';
      this.integrationError = e instanceof Error ? e.message : String(e);
    }
  }

  private async pollIntegrationForEntry(): Promise<void> {
    this.integrationFailures++;
    try {
      const status = await api.setupStatus();
      this.captureStatus(status);
      if (this.integrationReady(status)) {
        this.step3 = 'complete';
        if (this.integrationPollTimer) {
          clearInterval(this.integrationPollTimer);
          this.integrationPollTimer = null;
        }
        void this.onAllDone();
        return;
      }
    } catch {
      // ignore
    }
    if (this.integrationFailures >= 10) {
      if (this.integrationPollTimer) {
        clearInterval(this.integrationPollTimer);
        this.integrationPollTimer = null;
      }
      this.step3 = 'fallback';
    }
  }

  private async onAllDone(): Promise<void> {
    if (this.doneTimer) return;
    this.doneTimer = setTimeout(() => {
      this.doneTimer = null;
      window.location.hash = '/';
    }, 2000);
  }

  private dismiss(): void {
    if (this.doneTimer) {
      clearTimeout(this.doneTimer);
      this.doneTimer = null;
    }
    this.dispatchEvent(new CustomEvent('setup-dismissed', { bubbles: true, composed: true }));
    window.location.hash = '/';
  }

  private retryDiscovery(): void {
    void this.startDiscovery();
  }

  private retryConnection(): void {
    this.step1 = 'pending';
    this.validateAttempts = 0;
    if (this.activeBridgeUuid) {
      void api.bridgeReconnect(this.activeBridgeUuid);
    }
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }
    this.validatePollTimer = setInterval(() => void this.pollValidateStatus(), 1000);
  }

  render() {
    return html`
      <div class="wizard-page">
        <header class="wizard-header">
          <div>
            <h1>ESP-Tree Setup</h1>
            <p class="tagline">Connect your ESP-NOW bridge and get started.</p>
          </div>
          <button class="dismiss-btn" @click=${this.dismiss}>Close and go to topology</button>
        </header>

        <div class="stepper">
          ${this.renderStep1()}
          ${this.renderStep2()}
          ${this.renderStep3()}
          ${this.renderDone()}
        </div>
      </div>
    `;
  }

  private renderStep1() {
    const collapsed = this.step1 === 'complete' && this.step2 !== 'disabled';
    return html`
      <div class="step ${collapsed ? 'collapsed' : ''} ${this.step1 === 'complete' ? 'done' : ''} ${this.step1 === 'error' ? 'has-error' : ''}">
        <div class="step-header" @click=${() => { if (collapsed) this.requestUpdate(); }}>
          <span class="step-icon">
            ${this.step1 === 'scanning' ? html`<span class="spinner"></span>` :
              this.step1 === 'connecting' ? html`<span class="spinner"></span>` :
              this.step1 === 'pending' ? html`<span class="spinner"></span>` :
              this.step1 === 'complete' ? '\u2705' :
              this.step1 === 'error' ? '\u274C' : '1'}
          </span>
          <div class="step-title-area">
            <h2>Connect Your Bridge</h2>
            <p class="step-summary">
              ${this.step1 === 'scanning' ? 'Scanning for bridges on your network...' :
                this.step1 === 'found' ? `${this.discoveredBridges.length} bridge(s) found` :
                this.step1 === 'connecting' ? 'Connecting to bridge...' :
                this.step1 === 'pending' ? 'Validating bridge connection...' :
                this.step1 === 'complete' ? 'Bridge connected' :
                this.step1 === 'error' ? 'Bridge offline' : ''}
            </p>
          </div>
          ${collapsed ? html`<span class="collapse-icon">\u25B6</span>` : nothing}
        </div>

        ${!collapsed ? html`
          <div class="step-body">
            ${this.step1 === 'scanning' || this.step1 === 'connecting' || this.step1 === 'pending' ? html`
              <div class="scanning-state">
                <span class="spinner large"></span>
                <p>${this.step1 === 'scanning' ? 'Scanning for bridges on your network...' :
                  this.step1 === 'connecting' ? 'Connecting to bridge...' :
                  'Validating bridge connection...'}</p>
              </div>
            ` : nothing}

            ${this.step1 === 'found' ? html`
              ${this.discoveredBridges.length > 0 ? html`
                <div class="bridge-list">
                  ${this.discoveredBridges.map(b => html`
                    <div class="bridge-card">
                      <div class="bridge-info">
                        <strong>${b.name || b.host}</strong>
                        <span>${b.hostname || b.host}:${b.port}</span>
                        ${b.network_id ? html`<span class="net-id">Network: ${b.network_id}</span>` : nothing}
                      </div>
                      ${this.selectedBridge === b ? html`
                        <div class="api-key-row">
                          <input
                            type="password"
                            placeholder="API Key"
                            .value=${this.apiKeyInput}
                            @input=${(e: Event) => this.apiKeyInput = (e.target as HTMLInputElement).value}
                          />
                          <button class="btn btn-primary" @click=${() => this.connectBridgeBySelect(b)}>
                            Connect
                          </button>
                        </div>
                      ` : html`
                        <button class="btn btn-outline" @click=${() => this.selectBridgeForApiKey(b)}>
                          Connect
                        </button>
                      `}
                    </div>
                  `)}
                </div>
              ` : nothing}
            ` : nothing}

            ${this.step1 === 'pending' || this.step1 === 'error' ? html`
              <div class="bridge-list">
                ${this.activeBridgeUuid ? html`
                  <div class="bridge-card offline">
                    <div class="bridge-info">
                      <strong>${this.bridgeHost || 'Bridge'}</strong>
                      <span>${this.bridgeHost ? `${this.bridgeHost}:${this.bridgePort}` : ''}</span>
                      <span class="net-id">Offline</span>
                    </div>
                    <button class="btn btn-outline" @click=${this.retryConnection}>
                      Retry Connection
                    </button>
                  </div>
                ` : nothing}
              </div>
            ` : nothing}

            ${this.step1 !== 'connecting' && this.step1 !== 'pending' ? html`
              <div class="manual-toggle">
                <button class="btn btn-outline" @click=${() => this.manualMode = !this.manualMode}>
                  ${this.manualMode ? 'Hide manual entry' : 'Enter bridge address manually'}
                </button>
              </div>

              ${this.manualMode ? html`
                <div class="manual-form">
                  <label>
                    Host / IP
                    <input type="text" placeholder="192.168.1.50 or hostname.local" .value=${this.manualHost} @input=${(e: Event) => this.manualHost = (e.target as HTMLInputElement).value} />
                  </label>
                  <label>
                    Port
                    <input type="number" min="1" max="65535" .value=${String(this.manualPort)} @input=${(e: Event) => this.manualPort = Number((e.target as HTMLInputElement).value || 80)} />
                  </label>
                  <label>
                    API Key
                    <input type="password" placeholder="API Key (optional)" .value=${this.manualApiKey} @input=${(e: Event) => this.manualApiKey = (e.target as HTMLInputElement).value} />
                  </label>
                  <button class="btn btn-primary" @click=${this.connectManualBridge}>
                    Connect
                  </button>
                </div>
              ` : nothing}

              ${this.bridgeError ? html`
                <div class="error-block">
                  <p>${this.bridgeError}</p>
                  <button class="btn btn-outline" @click=${this.retryDiscovery}>Retry</button>
                </div>
              ` : nothing}
            ` : nothing}

            ${this.step1 === 'complete' && this.step2 === 'disabled' ? html`
              <div class="complete-state">
                <span class="check">\u2705</span>
                <span>${this.bridgeApiStatus || 'Bridge connected successfully'}</span>
              </div>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
    `;
  }

  private renderStep2() {
    const collapsed = this.step2 === 'complete' && this.step3 !== 'disabled';
    return html`
      <div class="step ${this.step2 === 'disabled' ? 'locked' : ''} ${collapsed ? 'collapsed' : ''} ${this.step2 === 'complete' ? 'done' : ''} ${this.step2 === 'error' ? 'has-error' : ''}">
        <div class="step-header">
          <span class="step-icon">
            ${this.step2 === 'disabled' ? '\u{1F512}' :
              this.step2 === 'restarting' ? html`<span class="spinner"></span>` :
              this.step2 === 'polling' ? html`<span class="spinner"></span>` :
              this.step2 === 'complete' ? '\u2705' :
              this.step2 === 'error' ? '\u274C' : '2'}
          </span>
          <div class="step-title-area">
            <h2>Restart Home Assistant</h2>
            <p class="step-summary">
              ${this.step2 === 'disabled' ? 'Complete step 1 first' :
                this.step2 === 'ready' ? 'Home Assistant needs to restart to activate the integration' :
                this.step2 === 'restarting' ? 'Restarting...' :
                this.step2 === 'polling' ? `Waiting for Home Assistant to come back online... (${this.pollingSeconds}s)` :
                this.step2 === 'complete' ? 'Home Assistant restarted successfully' :
                this.step2 === 'error' ? 'Restart failed' : ''}
            </p>
          </div>
          ${collapsed ? html`<span class="collapse-icon">\u25B6</span>` : nothing}
        </div>

        ${!collapsed ? html`
          <div class="step-body">
            ${this.step2 === 'disabled' ? html`
              <p class="muted">Connect a bridge first to continue.</p>
            ` : nothing}

            ${this.step2 === 'ready' ? html`
              <p>
                Home Assistant needs to restart to update the ESP Tree integration
                ${this.runningIntegrationVersion || this.latestIntegrationVersion ? html`
                  from ${this.runningIntegrationVersion || 'not loaded'} to ${this.latestIntegrationVersion || 'latest'}.
                ` : html`.`}
              </p>
              <button class="btn btn-primary" @click=${this.handleRestart}>
                Restart Home Assistant
              </button>
            ` : nothing}

            ${this.step2 === 'restarting' ? html`
              <div class="scanning-state">
                <span class="spinner large"></span>
                <p>Sending restart request...</p>
              </div>
            ` : nothing}

            ${this.step2 === 'polling' ? html`
              <div class="polling-state">
                <span class="spinner large"></span>
                <p>Waiting for Home Assistant to come back online...</p>
                ${this.pollingSeconds > 40 ? html`
                  <p class="muted">Taking longer than expected. Check if Home Assistant restarted successfully.</p>
                ` : nothing}
              </div>
            ` : nothing}

            ${this.step2 === 'complete' ? html`
              <div class="complete-state">
                <span class="check">\u2705</span>
                <span>
                  Home Assistant is running the ESP Tree integration
                  ${this.runningIntegrationVersion ? ` ${this.runningIntegrationVersion}` : ''}
                </span>
              </div>
            ` : nothing}

            ${this.step2 === 'error' && this.restartError ? html`
              <div class="error-block">
                <p>Restart failed: ${this.restartError}</p>
                <button class="btn btn-outline" @click=${this.handleRestart}>Retry</button>
              </div>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
    `;
  }

  private renderStep3() {
    return html`
      <div class="step ${this.step3 === 'disabled' ? 'locked' : ''} ${this.step3 === 'complete' ? 'done' : ''}">
        <div class="step-header">
          <span class="step-icon">
            ${this.step3 === 'disabled' ? '\u{1F512}' :
              this.step3 === 'triggering' ? html`<span class="spinner"></span>` :
              this.step3 === 'polling' ? html`<span class="spinner"></span>` :
              this.step3 === 'complete' ? '\u2705' :
              this.step3 === 'fallback' ? '\u26A0\uFE0F' :
              this.step3 === 'error' ? '\u274C' : '3'}
          </span>
          <div class="step-title-area">
            <h2>Add ESP Tree Integration</h2>
            <p class="step-summary">
              ${this.step3 === 'disabled' ? 'Complete step 2 first' :
                this.step3 === 'triggering' ? 'Setting up the ESP Tree integration...' :
                this.step3 === 'polling' ? 'Waiting for integration to activate...' :
                this.step3 === 'complete' ? 'ESP Tree integration is active' :
                this.step3 === 'fallback' ? 'Manual setup required' :
                this.step3 === 'error' ? 'Could not set up integration' : ''}
            </p>
          </div>
        </div>

        <div class="step-body">
          ${this.step3 === 'disabled' ? html`
            <p class="muted">Restart Home Assistant first to continue.</p>
          ` : nothing}

          ${this.step3 === 'triggering' ? html`
            <div class="scanning-state">
              <span class="spinner large"></span>
              <p>Setting up the ESP Tree integration...</p>
            </div>
          ` : nothing}

          ${this.step3 === 'polling' ? html`
            <div class="polling-state">
              <span class="spinner large"></span>
              <p>Waiting for integration to become active...</p>
            </div>
          ` : nothing}

          ${this.step3 === 'complete' ? html`
            <div class="complete-state">
              <span class="check">\u2705</span>
              <span>
                ESP Tree integration is active
                ${this.runningIntegrationVersion ? ` (${this.runningIntegrationVersion})` : ''}
              </span>
            </div>
          ` : nothing}

          ${this.step3 === 'fallback' ? html`
            <div class="fallback-state">
              <p>Automatic setup didn't complete. You can add it manually:</p>
              <div class="fallback-actions">
                <button class="btn btn-outline" @click=${() => window.open('/config/integrations/dashboard', '_blank')}>
                  Open Devices &amp; Services
                </button>
                <button class="btn btn-outline" @click=${() => window.open('/config/integrations/dashboard/add?domain=esp_tree', '_blank')}>
                  Add ESP Tree Integration
                </button>
              </div>
              <button class="btn" @click=${() => { this.integrationFailures = 0; void this.triggerIntegrationSetup(); }}>
                Retry Automatic Setup
              </button>
            </div>
          ` : nothing}

          ${this.step3 === 'error' && this.integrationError ? html`
            <div class="error-block">
              <p>Could not set up integration automatically: ${this.integrationError}</p>
              <div class="fallback-actions">
                <button class="btn btn-outline" @click=${() => window.open('/config/integrations/dashboard', '_blank')}>
                  Open Devices &amp; Services
                </button>
                <button class="btn btn-outline" @click=${() => window.open('/config/integrations/dashboard/add?domain=esp_tree', '_blank')}>
                  Add ESP Tree Integration
                </button>
              </div>
              <button class="btn" @click=${() => { this.integrationError = null; void this.triggerIntegrationSetup(); }}>
                Retry
              </button>
            </div>
          ` : nothing}
        </div>
      </div>
    `;
  }

  private renderDone() {
    if (this.step1 !== 'complete' || this.step2 !== 'complete' || this.step3 !== 'complete') return nothing;
    return html`
      <div class="step done expanded">
        <div class="step-header">
          <span class="step-icon">\u2728</span>
          <div class="step-title-area">
            <h2>Setup Complete!</h2>
            <p class="step-summary">Redirecting to topology map...</p>
          </div>
        </div>
        <div class="step-body done-body">
          <button class="btn btn-primary" @click=${this.dismiss}>Go Now</button>
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      --bg: #f5f7fa;
      --surface: #ffffff;
      --ink: #1c1c1e;
      --muted: #64748b;
      --line: #e2e8f0;
      --primary: #0b3b4b;
      --accent: #f39c12;
      --danger: #ef4444;
      --ok: #22c55e;
      --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      display: block;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }

    .wizard-page {
      max-width: 680px;
      margin: 0 auto;
      padding: 40px 24px;
    }

    .wizard-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 2px solid var(--line);
    }

    .wizard-header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
      color: var(--primary);
    }

    .tagline {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 15px;
    }

    .dismiss-btn {
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--muted);
      padding: 8px 16px;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
      border-radius: 8px;
      white-space: nowrap;
      transition: all 0.15s;
    }

    .dismiss-btn:hover {
      border-color: var(--muted);
      color: var(--ink);
    }

    .stepper {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .step {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: var(--shadow);
      overflow: hidden;
      transition: opacity 0.2s;
    }

    .step.locked {
      opacity: 0.55;
    }

    .step.done {
      border-color: var(--ok);
    }

    .step.has-error {
      border-color: var(--danger);
    }

    .step-header {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 18px 20px;
    }

    .step.collapsed .step-header {
      cursor: pointer;
    }

    .step-icon {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      background: #f1f5f9;
      border-radius: 50%;
      margin-top: 2px;
    }

    .step.complete .step-icon,
    .step.done .step-icon {
      background: #dcfce7;
    }

    .step-title-area {
      flex: 1;
    }

    .step-title-area h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .step-summary {
      margin: 4px 0 0;
      font-size: 13px;
      color: var(--muted);
    }

    .collapse-icon {
      font-size: 12px;
      color: var(--muted);
      margin-top: 6px;
    }

    .step-body {
      padding: 0 20px 20px 70px;
    }

    .step.collapsed .step-body {
      display: none;
    }

    .scanning-state,
    .polling-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 0;
      gap: 12px;
    }

    .scanning-state p,
    .polling-state p {
      margin: 0;
      font-size: 14px;
      color: var(--muted);
    }

    .complete-state {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 0;
      font-size: 14px;
      font-weight: 500;
      color: var(--ok);
    }

    .step-body.done-body {
      padding: 0 20px 20px 70px;
    }

    .step-body.done-body .btn {
      margin-top: 4px;
    }

    .check {
      font-size: 18px;
    }

    .bridge-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 16px;
    }

    .bridge-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: #f8fafc;
      border: 1px solid #f1f5f9;
      border-radius: 10px;
      gap: 12px;
      flex-wrap: wrap;
    }

    .bridge-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 13px;
    }

    .bridge-info strong {
      font-size: 14px;
    }

    .net-id {
      font-size: 11px;
      color: var(--muted);
      font-family: monospace;
    }

    .api-key-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .api-key-row input {
      padding: 6px 10px;
      font-size: 13px;
      border: 1px solid var(--line);
      border-radius: 6px;
      width: 180px;
    }

    .manual-toggle {
      margin-bottom: 12px;
    }

    .manual-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      background: #f8fafc;
      border: 1px solid #f1f5f9;
      border-radius: 10px;
      margin-bottom: 12px;
    }

    .manual-form label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
    }

    .manual-form input {
      padding: 8px 12px;
      font-size: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      font-family: inherit;
    }

    .error-block {
      margin-top: 12px;
      padding: 12px 16px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
    }

    .error-block p {
      margin: 0 0 8px;
      color: var(--danger);
      font-size: 13px;
    }

    .fallback-state {
      padding: 16px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      margin-top: 8px;
    }

    .fallback-state p {
      margin: 0 0 12px;
      font-size: 14px;
    }

    .fallback-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .btn {
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      padding: 8px 16px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 8px;
      transition: all 0.15s;
    }

    .btn:hover {
      background: #f1f5f9;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .btn-primary:hover {
      background: #0e4a5e;
    }

    .btn-outline {
      border-color: var(--primary);
      color: var(--primary);
      background: transparent;
    }

    .btn-outline:hover {
      background: rgba(11, 59, 75, 0.06);
    }

    .muted {
      color: var(--muted);
      font-size: 13px;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 3px solid rgba(11, 59, 75, 0.2);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    .spinner.large {
      width: 32px;
      height: 32px;
      border-width: 4px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 600px) {
      .wizard-page {
        padding: 24px 16px;
      }

      .wizard-header {
        flex-direction: column;
        gap: 12px;
      }

      .step-body {
        padding: 0 16px 16px 54px;
      }

      .bridge-card {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `;
}
