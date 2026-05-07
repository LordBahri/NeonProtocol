import { WindowBase } from './WindowBase.ts';
import { injectTheme } from './UITheme.ts';
import { globalBus }   from '../../core/network/MessageBus.ts';
import type { NetworkSystem } from '../../core/network/NetworkSystem.ts';

interface ChatMessage {
  sessionId:  string;
  username:   string;
  message:    string;
  channel:    'local' | 'corp' | 'system';
  timestamp:  number;
}

const CHANNEL_COLOR: Record<string, string> = {
  local:  '#c8e6ff',
  corp:   '#00ffcc',
  system: '#ffd700',
};

const MAX_DISPLAYED = 60;

/**
 * Holographic chat window — handles local and corporation channels.
 * Shortcut: T
 * Prefix messages with  /corp  to send to corporation channel.
 */
export class ChatWindow extends WindowBase {
  private _logEl!:  HTMLElement;
  private _inputEl!: HTMLInputElement;
  private _network: NetworkSystem | null;
  private _unsubs:  Array<() => void> = [];

  constructor(
    onFocus: (id: string) => void,
    network: NetworkSystem | null = null,
  ) {
    injectTheme();
    super({
      id:          'chat',
      title:       'COMMS  ·  LOCAL',
      width:       420,
      height:      280,
      x:           16,
      y:           Math.max(16, window.innerHeight - 300),
      shortcutKey: 'KeyT',
      onFocus,
    });
    this._network = network;
  }

  protected build(): void {
    this.contentEl.style.cssText = 'display:flex;flex-direction:column;height:100%;padding:0;';

    // ── Message log ────────────────────────────────────────────────────────
    this._logEl = document.createElement('div');
    this._logEl.style.cssText = `
      flex:1; overflow-y:auto; padding:6px 10px;
      font-family:'Courier New',monospace; font-size:11px;
      scrollbar-width:thin; scrollbar-color:#004444 transparent;
    `;
    this.contentEl.appendChild(this._logEl);

    // ── Input row ──────────────────────────────────────────────────────────
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;padding:6px 8px;border-top:1px solid #004466;';

    this._inputEl = document.createElement('input');
    this._inputEl.type        = 'text';
    this._inputEl.maxLength   = 200;
    this._inputEl.placeholder = 'Message… (/corp for corp chat)';
    this._inputEl.style.cssText = `
      flex:1; background:rgba(0,20,40,0.8); border:1px solid #006688; color:#aaddff;
      font-family:'Courier New',monospace; font-size:11px; padding:4px 8px;
      outline:none;
    `;

    const sendBtn = document.createElement('button');
    sendBtn.textContent = '▶';
    sendBtn.style.cssText = `
      background:#004466; border:1px solid #006688; color:#00ccff;
      padding:4px 10px; font-size:12px; cursor:pointer;
    `;

    row.appendChild(this._inputEl);
    row.appendChild(sendBtn);
    this.contentEl.appendChild(row);

    // ── Event bindings ──────────────────────────────────────────────────────
    this._inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this._send();
        e.stopPropagation();
      }
      e.stopPropagation(); // prevent game shortcuts while typing
    });

    sendBtn.addEventListener('click', () => this._send());

    // ── Subscribe to network events ────────────────────────────────────────
    this._unsubs.push(
      globalBus.on<ChatMessage>('chat:message', (msg) => this._addMessage(msg)),
      globalBus.on<ChatMessage[]>('chat:history', (msgs) => {
        for (const m of msgs) this._addMessage(m, false);
        this._scrollToBottom();
      }),
      globalBus.on<{ message: string }>('chat:error', (err) => {
        this._addLocal('SYSTEM', err.message, 'system');
      }),
    );
  }

  protected onShow(): void {
    // Focus input when window opens
    requestAnimationFrame(() => this._inputEl?.focus());
  }

  destroy(): void {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    super.destroy();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _send(): void {
    const raw = this._inputEl.value.trim();
    if (!raw) return;
    this._inputEl.value = '';

    let channel: 'local' | 'corp' = 'local';
    let message = raw;

    if (raw.startsWith('/corp ')) {
      channel = 'corp';
      message = raw.slice(6).trim();
    } else if (raw === '/corp') {
      this._addLocal('SYSTEM', 'Usage: /corp <message>', 'system');
      return;
    }

    if (!message) return;

    if (this._network?.connected) {
      this._network.sendChat(message, channel);
    } else {
      // Offline — echo locally
      this._addLocal('You', message, channel);
    }
  }

  private _addMessage(msg: ChatMessage, scroll = true): void {
    const color    = CHANNEL_COLOR[msg.channel] ?? '#aaddff';
    const time     = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const prefix   = msg.channel === 'system' ? '' : `[${msg.channel.toUpperCase()}] `;
    const html     = `<div style="color:${color};margin:1px 0;">`
                   + `<span style="opacity:0.5;font-size:10px;">${time} </span>`
                   + `<span style="color:#66aacc;">${this._esc(msg.username)}</span>`
                   + `<span style="opacity:0.6;"> ${prefix}</span>`
                   + `<span>${this._esc(msg.message)}</span>`
                   + `</div>`;

    this._logEl.insertAdjacentHTML('beforeend', html);

    // Keep log bounded
    while (this._logEl.children.length > MAX_DISPLAYED) {
      this._logEl.firstChild?.remove();
    }

    if (scroll) this._scrollToBottom();
  }

  private _addLocal(username: string, message: string, channel: 'local' | 'corp' | 'system'): void {
    this._addMessage({ sessionId: '', username, message, channel, timestamp: Date.now() });
  }

  private _scrollToBottom(): void {
    this._logEl.scrollTop = this._logEl.scrollHeight;
  }

  private _esc(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
