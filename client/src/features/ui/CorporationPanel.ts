import { WindowBase } from './WindowBase.ts';
import { globalBus } from '../../core/network/MessageBus.ts';
import { useGameStore } from '../../store/gameStore.ts';

interface CorpMember {
  name:     string;
  rank:     string;
  online:   boolean;
  location: string;
  standing: number; // -1 to 1
}

const MOCK_MEMBERS: CorpMember[] = [
  { name: 'CMDR Varix',    rank: 'Director',  online: true,  location: 'Nyx Prime',    standing:  0.9 },
  { name: 'Pilot Kael',    rank: 'Senior',    online: true,  location: 'Vega Station', standing:  0.75 },
  { name: 'Lt. Synthe',    rank: 'Officer',   online: false, location: 'Deep Rim',     standing:  0.6 },
  { name: 'Pilot Orex',    rank: 'Member',    online: true,  location: 'Sector-001',   standing:  0.55 },
  { name: 'Dr. Vael',      rank: 'Scientist', online: false, location: 'Ore Belt 4',   standing:  0.4 },
  { name: 'Miner Tark',    rank: 'Recruit',   online: false, location: 'Unknown',      standing:  0.2 },
];

const WAR_TARGETS = ['Crimson Fleet', 'Void Syndicate'];

const FLEET_OPS = [
  { op: 'Mining Op — Ore Belt Alpha', fc: 'CMDR Varix', slots: 6, filled: 3 },
  { op: 'PvP Roam — Rim Sectors',     fc: 'Pilot Kael', slots: 10, filled: 7 },
];

export class CorporationPanel extends WindowBase {
  private _tab: 'members' | 'fleet' | 'wars' | 'chat' = 'members';
  private _chatLog: Array<{ from: string; msg: string; ts: number }> = [];

  constructor(onFocus: (id: string) => void) {
    super({
      id:          'corporation',
      title:       'CORPORATION PANEL',
      width:       460,
      height:      520,
      x:           900,
      y:           80,
      shortcutKey: 'KeyC',
      onFocus,
    });

    this._chatLog = [
      { from: 'CMDR Varix', msg: 'Fleet forming at Vega Station in 5 min', ts: Date.now() - 120_000 },
      { from: 'Pilot Kael', msg: 'Roger, on my way', ts: Date.now() - 90_000 },
      { from: 'Dr. Vael',   msg: 'Ore belt 4 is rich today, 3k velite so far', ts: Date.now() - 45_000 },
    ];

    globalBus.on('contract:completed', (d: unknown) => {
      const { contractId } = d as { contractId: string };
      void contractId;
      this._chatLog.push({ from: '[SYSTEM]', msg: 'Contract completed', ts: Date.now() });
    });
  }

  protected build(): void {
    // Corp header
    const header = document.createElement('div');
    header.style.cssText = `
      padding:10px 14px 8px;
      background:rgba(0,14,28,0.9);
      border-bottom:1px solid rgba(0,140,180,0.15);
      display:flex;align-items:center;gap:12px;
      flex-shrink:0;
    `;
    header.innerHTML = `
      <!-- Corp logo placeholder -->
      <div style="
        width:44px;height:44px;
        border:1px solid rgba(0,200,255,0.3);
        background:rgba(0,30,50,0.8);
        display:flex;align-items:center;justify-content:center;
        font-size:20px;color:rgba(0,200,255,0.6);
        clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);
      ">◈</div>
      <div>
        <div style="font-size:14px;color:#00eeff;letter-spacing:2px;text-shadow:0 0 8px rgba(0,220,255,0.5);">NEON ACCORD</div>
        <div class="holo-label">[NEON]  •  Industrial / PvP  •  47 MEMBERS</div>
        <div style="margin-top:3px;display:flex;gap:10px;">
          <span style="font-size:8px;color:#00ff88;"><span class="holo-dot online" style="width:5px;height:5px;"></span>${MOCK_MEMBERS.filter(m => m.online).length} ONLINE</span>
          <span style="font-size:8px;color:rgba(0,150,180,0.5);">${MOCK_MEMBERS.length} SHOWN</span>
        </div>
      </div>
    `;
    this.el.insertBefore(header, this.contentEl);

    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'holo-tabs';
    tabs.innerHTML = `
      <div class="holo-tab active" data-tab="members">MEMBERS</div>
      <div class="holo-tab"       data-tab="fleet">FLEET OPS</div>
      <div class="holo-tab"       data-tab="wars">WAR TARGETS</div>
      <div class="holo-tab"       data-tab="chat">CORP CHAT</div>
    `;
    this.el.insertBefore(tabs, this.contentEl);

    tabs.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).dataset.tab as typeof this._tab | undefined;
      if (!t) return;
      this._tab = t;
      tabs.querySelectorAll('.holo-tab').forEach(el => el.classList.remove('active'));
      (e.target as HTMLElement).classList.add('active');
      this._render();
    });

    this.contentEl.style.height = 'calc(100% - 32px - 64px - 30px)';
    this._render();
  }

  protected onShow(): void { this._render(); }
  update(_dt: number): void {}

  private _render(): void {
    switch (this._tab) {
      case 'members':  this._renderMembers();  break;
      case 'fleet':    this._renderFleet();    break;
      case 'wars':     this._renderWars();     break;
      case 'chat':     this._renderChat();     break;
    }
  }

  // ── Members ───────────────────────────────────────────────────────────────

  private _renderMembers(): void {
    const onlineFirst = [...MOCK_MEMBERS].sort((a, b) => Number(b.online) - Number(a.online));
    this.contentEl.innerHTML = `
      <div class="holo-scrollable" style="height:100%;">
        <div style="padding:4px 0;">
          ${onlineFirst.map(m => this._memberRow(m)).join('')}
        </div>
      </div>
    `;
  }

  private _memberRow(m: CorpMember): string {
    const standColor = m.standing > 0.6 ? '#00ff88' : m.standing > 0 ? '#ffaa00' : '#ff3344';
    const standBars  = Math.round(Math.abs(m.standing) * 5);
    const standStr   = '█'.repeat(standBars) + '░'.repeat(5 - standBars);
    return `
      <div class="holo-item-row">
        <span class="holo-dot ${m.online ? 'online' : 'offline'}"></span>
        <div style="flex:1;">
          <div style="color:#00ccee;font-size:10px;">${m.name}</div>
          <div class="holo-label">${m.rank} — ${m.location}</div>
        </div>
        <div style="text-align:right;">
          <div style="color:${standColor};font-size:9px;letter-spacing:1px;">${standStr}</div>
          <div class="holo-label">${m.online ? 'ACTIVE' : 'OFFLINE'}</div>
        </div>
      </div>`;
  }

  // ── Fleet ops ─────────────────────────────────────────────────────────────

  private _renderFleet(): void {
    this.contentEl.innerHTML = `
      <div style="padding:10px;">
        ${FLEET_OPS.map(op => {
          const pct  = (op.filled / op.slots) * 100;
          return `
            <div style="
              padding:12px;margin-bottom:8px;
              background:rgba(0,12,24,0.8);
              border:1px solid rgba(0,150,200,0.18);
            ">
              <div style="color:#00ccee;font-size:11px;margin-bottom:4px;">${op.op}</div>
              <div class="holo-label" style="margin-bottom:6px;">FC: ${op.fc}</div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <div class="holo-bar-track" style="flex:1;">
                  <div class="holo-bar-fill" style="width:${pct}%;background:#00aaff;box-shadow:0 0 4px #0088ee;"></div>
                </div>
                <span style="color:#00aaff;font-size:10px;">${op.filled}/${op.slots}</span>
              </div>
              <button class="holo-action-btn" style="width:100%;">JOIN FLEET OP</button>
            </div>`;
        }).join('')}
        <button class="holo-action-btn" style="width:100%;margin-top:4px;" id="corp-create-op">CREATE FLEET OP</button>
      </div>
    `;
  }

  // ── War targets ────────────────────────────────────────────────────────────

  private _renderWars(): void {
    this.contentEl.innerHTML = `
      <div style="padding:10px;">
        <div class="holo-label" style="margin-bottom:8px;color:rgba(255,60,80,0.6);">ACTIVE WAR DECLARATIONS</div>
        ${WAR_TARGETS.map(wt => `
          <div style="
            padding:10px 12px;margin-bottom:6px;
            background:rgba(30,0,8,0.6);
            border:1px solid rgba(255,40,60,0.22);
            display:flex;align-items:center;justify-content:space-between;
          ">
            <div>
              <div style="color:#ff6677;font-size:11px;">${wt}</div>
              <div class="holo-label">MUTUAL WAR — SHOOT ON SIGHT</div>
            </div>
            <span style="font-size:20px;color:rgba(255,60,80,0.4);">⚔</span>
          </div>`).join('')}
        <div class="holo-divider"></div>
        <div class="holo-label" style="margin-bottom:8px;color:rgba(0,200,100,0.5);">STANDINGS — NEUTRAL / BLUE</div>
        <div style="color:rgba(0,150,180,0.35);font-size:9px;letter-spacing:1px;padding:8px;">
          No active standings entries.
        </div>
      </div>
    `;
  }

  // ── Corp chat ─────────────────────────────────────────────────────────────

  private _renderChat(): void {
    const msgHtml = this._chatLog.map(entry => {
      const t    = new Date(entry.ts);
      const ts   = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}`;
      const col  = entry.from === '[SYSTEM]' ? 'rgba(0,200,150,0.5)' : '#00ccee';
      return `
        <div style="padding:3px 10px;border-bottom:1px solid rgba(0,100,130,0.07);">
          <span style="color:rgba(0,120,150,0.5);font-size:9px;">[${ts}] </span>
          <span style="color:${col};font-size:10px;">${entry.from}: </span>
          <span style="color:rgba(0,200,240,0.75);font-size:10px;">${entry.msg}</span>
        </div>`;
    }).join('');

    const playerId = useGameStore.getState().localPlayerId || 'Pilot';

    this.contentEl.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;">
        <div class="holo-scrollable" style="flex:1;padding:4px 0;" id="corp-chat-log">
          ${msgHtml}
        </div>
        <div style="padding:6px 10px;border-top:1px solid rgba(0,140,180,0.12);display:flex;gap:6px;">
          <input class="holo-input" placeholder="Say something..." id="corp-chat-input"
            style="flex:1;" maxlength="120"/>
          <button class="holo-action-btn" id="corp-chat-send">SEND</button>
        </div>
      </div>
    `;

    // Auto-scroll to bottom
    const log = this.contentEl.querySelector('#corp-chat-log');
    if (log) log.scrollTop = log.scrollHeight;

    const input = this.contentEl.querySelector('#corp-chat-input') as HTMLInputElement;
    const send  = () => {
      const msg = input.value.trim();
      if (!msg) return;
      this._chatLog.push({ from: playerId, msg, ts: Date.now() });
      input.value = '';
      this._renderChat();
    };
    this.contentEl.querySelector('#corp-chat-send')?.addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); e.stopPropagation(); });
  }
}
