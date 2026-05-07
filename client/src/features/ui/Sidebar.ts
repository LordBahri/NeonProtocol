import { gsap } from 'gsap';

export interface SidebarButton {
  id:        string;
  icon:      string;   // SVG path data
  label:     string;
  hotkey:    string;   // display only
  windowId?: string;   // UIManager id to toggle
  action?:   () => void;
  badge?:    number;
}

type IsOpenFn  = (id: string) => boolean;
type ToggleFn  = (id: string) => void;

const SIDEBAR_CSS = `
.np-sidebar {
  position: fixed;
  left: 0; top: 0; bottom: 0;
  width: 58px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 0;
  z-index: 190;
  background: linear-gradient(180deg, rgba(0,8,20,0.96) 0%, rgba(0,4,14,0.98) 100%);
  border-right: 1px solid rgba(0,238,255,0.15);
  box-shadow: 2px 0 20px rgba(0,0,0,0.6), inset -1px 0 0 rgba(0,238,255,0.08);
  user-select: none;
}
.np-sidebar::after {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0; right: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(0,238,255,0.012) 3px,
    rgba(0,238,255,0.012) 4px
  );
  pointer-events: none;
}

/* Portrait */
.np-sb-portrait {
  width: 42px; height: 42px;
  border-radius: 4px;
  border: 1px solid rgba(0,238,255,0.3);
  background: rgba(0,136,255,0.15);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 4px;
  position: relative;
  cursor: pointer;
  transition: border-color 0.2s;
  overflow: hidden;
  flex-shrink: 0;
}
.np-sb-portrait:hover { border-color: rgba(0,238,255,0.7); }
.np-sb-portrait svg { width: 26px; height: 26px; fill: #00aacc; }
.np-sb-status {
  position: absolute; bottom: 2px; right: 2px;
  width: 7px; height: 7px; border-radius: 50%;
  background: #00ff88;
  box-shadow: 0 0 6px #00ff88;
}

/* Pilot info tooltip on portrait hover */
.np-sb-pilot-info {
  position: absolute;
  left: 62px; top: 0;
  background: rgba(0,8,20,0.95);
  border: 1px solid rgba(0,238,255,0.3);
  border-radius: 4px;
  padding: 8px 12px;
  min-width: 160px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  white-space: nowrap;
}
.np-sb-portrait:hover .np-sb-pilot-info { opacity: 1; }
.np-sb-pilot-name {
  font-family: 'Share Tech Mono', monospace;
  font-size: 13px; color: #00eeff; letter-spacing: 0.05em;
}
.np-sb-corp-ticker {
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px; color: rgba(0,238,255,0.5); margin-top: 2px;
}

/* Divider */
.np-sb-divider {
  width: 36px; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(0,238,255,0.3), transparent);
  margin: 6px 0; flex-shrink: 0;
}

/* Spacer */
.np-sb-spacer { flex: 1; }

/* Buttons */
.np-sb-btn {
  position: relative;
  width: 46px; height: 46px;
  margin: 2px 0;
  border-radius: 6px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 2px;
  cursor: pointer;
  border: 1px solid rgba(0,238,255,0.12);
  background: rgba(0,238,255,0.04);
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  flex-shrink: 0;
}
.np-sb-btn:hover {
  background: rgba(0,238,255,0.10);
  border-color: rgba(0,238,255,0.4);
}
.np-sb-btn.active {
  background: rgba(0,238,255,0.12);
  border-color: rgba(0,238,255,0.55);
  box-shadow: 0 0 12px rgba(0,238,255,0.25), inset 0 0 8px rgba(0,238,255,0.08);
}
.np-sb-btn.active .np-sb-btn-icon { fill: #00eeff; filter: drop-shadow(0 0 4px #00eeff); }
.np-sb-btn svg.np-sb-btn-icon {
  width: 22px; height: 22px;
  fill: rgba(0,200,230,0.7);
  transition: fill 0.15s, filter 0.15s;
}
.np-sb-btn:hover svg.np-sb-btn-icon { fill: #00eeff; }
.np-sb-hotkey {
  font-family: 'Share Tech Mono', monospace;
  font-size: 8px; color: rgba(0,238,255,0.35);
  letter-spacing: 0.05em; line-height: 1;
}
.np-sb-btn.active .np-sb-hotkey { color: rgba(0,238,255,0.6); }

/* Tooltip */
.np-sb-tooltip {
  position: absolute;
  left: 52px; top: 50%; transform: translateY(-50%);
  background: rgba(0,8,20,0.95);
  border: 1px solid rgba(0,238,255,0.3);
  border-radius: 4px;
  padding: 5px 10px;
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px; color: #00eeff;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0; transition: opacity 0.12s;
  letter-spacing: 0.06em;
  z-index: 300;
}
.np-sb-btn:hover .np-sb-tooltip { opacity: 1; }

/* Badge */
.np-sb-badge {
  position: absolute;
  top: 3px; right: 3px;
  min-width: 14px; height: 14px;
  border-radius: 7px;
  background: #ff2244;
  color: #fff;
  font-family: 'Share Tech Mono', monospace;
  font-size: 9px; line-height: 14px;
  text-align: center; padding: 0 3px;
  display: none;
  box-shadow: 0 0 6px rgba(255,34,68,0.8);
}
.np-sb-badge.visible { display: block; }
`;

const ICON_SHIP = `<path d="M12 2L4 20h2l6-3 6 3h2L12 2zm0 4l4.5 11H14l-2-1-2 1H7.5L12 6z"/>`;
const ICON_FITTING = `<path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 00-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>`;
const ICON_MARKET = `<path d="M3 3h2l.4 2M7 13h10l4-8H5.4L7 13zm0 0L5.4 5M7 13l-2 9m2-9h10m0 0l2 9M9 21a1 1 0 100-2 1 1 0 000 2zm10 0a1 1 0 100-2 1 1 0 000 2z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
const ICON_MAP = `<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>`;
const ICON_CORP = `<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>`;
const ICON_CHAT = `<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>`;
const ICON_PORTRAIT = `<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>`;

let _cssInjected = false;
function injectSidebarCSS(): void {
  if (_cssInjected) return;
  _cssInjected = true;
  const style = document.createElement('style');
  style.textContent = SIDEBAR_CSS;
  document.head.appendChild(style);
}

export class Sidebar {
  private el: HTMLElement;
  private _buttons: Map<string, HTMLElement> = new Map();
  private _badges:  Map<string, HTMLElement> = new Map();
  private _isOpen:  IsOpenFn;
  private _toggle:  ToggleFn;
  private _pilotNameEl!: HTMLElement;
  private _corpEl!:      HTMLElement;

  constructor(
    parent: HTMLElement,
    isOpen: IsOpenFn,
    toggle: ToggleFn,
  ) {
    injectSidebarCSS();
    this._isOpen = isOpen;
    this._toggle = toggle;

    this.el = document.createElement('nav');
    this.el.className = 'np-sidebar';

    this._buildPortrait();
    this._addDivider();
    this._buildButtons([
      { id: 'inventory', icon: ICON_SHIP,    label: 'Cargo',      hotkey: 'I', windowId: 'inventory' },
      { id: 'fitting',   icon: ICON_FITTING, label: 'Fitting',    hotkey: 'F', windowId: 'fitting'   },
      { id: 'market',    icon: ICON_MARKET,  label: 'Market',     hotkey: 'M', windowId: 'market'    },
    ]);
    this._addDivider();
    this._buildButtons([
      { id: 'corp',      icon: ICON_CORP,    label: 'Corporation',hotkey: 'C', windowId: 'corp'      },
      { id: 'chat',      icon: ICON_CHAT,    label: 'Comms',      hotkey: 'T', windowId: 'chat'      },
    ]);
    this._addDivider();
    this._buildButtons([
      { id: 'map',       icon: ICON_MAP,     label: 'Star Map',   hotkey: 'N', windowId: 'map'       },
    ]);

    // Push bottom group to bottom
    const spacer = document.createElement('div');
    spacer.className = 'np-sb-spacer';
    this.el.appendChild(spacer);

    parent.appendChild(this.el);

    // Entrance animation
    gsap.fromTo(this.el,
      { x: -58, opacity: 0 },
      { x: 0,   opacity: 1, duration: 0.45, ease: 'power3.out', delay: 0.1 },
    );
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setPilot(name: string, corpTicker: string): void {
    if (this._pilotNameEl) this._pilotNameEl.textContent = name;
    if (this._corpEl)      this._corpEl.textContent      = corpTicker ? `[${corpTicker}]` : '';
  }

  setBadge(buttonId: string, count: number): void {
    const badge = this._badges.get(buttonId);
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.classList.add('visible');
    } else {
      badge.classList.remove('visible');
    }
  }

  /** Call each frame to keep active-state highlights in sync. */
  update(): void {
    for (const [id, btn] of this._buttons) {
      const open = this._isOpen(id);
      btn.classList.toggle('active', open);
    }
  }

  destroy(): void {
    gsap.killTweensOf(this.el);
    this.el.remove();
  }

  // ── Private builders ────────────────────────────────────────────────────────

  private _buildPortrait(): void {
    const portrait = document.createElement('div');
    portrait.className = 'np-sb-portrait';
    portrait.innerHTML = `
      <svg viewBox="0 0 24 24">${ICON_PORTRAIT}</svg>
      <div class="np-sb-status"></div>
      <div class="np-sb-pilot-info">
        <div class="np-sb-pilot-name">PILOT</div>
        <div class="np-sb-corp-ticker"></div>
      </div>`;
    this.el.appendChild(portrait);
    this._pilotNameEl = portrait.querySelector('.np-sb-pilot-name') as HTMLElement;
    this._corpEl      = portrait.querySelector('.np-sb-corp-ticker') as HTMLElement;
  }

  private _addDivider(): void {
    const div = document.createElement('div');
    div.className = 'np-sb-divider';
    this.el.appendChild(div);
  }

  private _buildButtons(defs: SidebarButton[]): void {
    for (const def of defs) {
      const btn = document.createElement('div');
      btn.className = 'np-sb-btn';
      btn.setAttribute('data-id', def.id);

      const isSvgPath = def.icon.startsWith('<path') || def.icon.startsWith('<polyline') || def.icon.startsWith('<circle');
      const svgContent = isSvgPath
        ? `<svg viewBox="0 0 24 24" class="np-sb-btn-icon">${def.icon}</svg>`
        : `<svg viewBox="0 0 24 24" class="np-sb-btn-icon"><path d="${def.icon}"/></svg>`;

      btn.innerHTML = `
        ${svgContent}
        <span class="np-sb-hotkey">${def.hotkey}</span>
        <div class="np-sb-tooltip">${def.label} [${def.hotkey}]</div>
        <div class="np-sb-badge" id="np-badge-${def.id}"></div>`;

      btn.addEventListener('click', () => {
        if (def.windowId) {
          this._toggle(def.windowId);
        } else {
          def.action?.();
        }
        // Micro-pulse feedback
        gsap.fromTo(btn, { scale: 0.88 }, { scale: 1, duration: 0.25, ease: 'elastic.out(1.2,0.5)' });
      });

      this._buttons.set(def.id, btn);
      this._badges.set(def.id,  btn.querySelector('.np-sb-badge') as HTMLElement);
      this.el.appendChild(btn);
    }
  }
}
