import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import type { Application } from 'pixi.js';
import type { GalaxyData, StarSystem } from './GalaxyTypes.ts';
import { FACTION_DEFS, HAZARD_COLORS } from './GalaxyTypes.ts';
import { GalaxyRenderer } from './GalaxyRenderer.ts';
import type { FogOfWar } from './FogOfWar.ts';
import type { FactionInfluence } from './FactionInfluence.ts';
import type { TrafficSystem } from './TrafficSystem.ts';

const MAP_PX    = 700;
const MAP_PAD   = 24;
const PANEL_W   = 220;

// ── System info panel ─────────────────────────────────────────────────────────

function buildInfoPanel(sys: StarSystem | null): HTMLElement {
  const panel = document.getElementById('galaxy-info-panel') ?? (() => {
    const el = document.createElement('div');
    el.id    = 'galaxy-info-panel';
    document.getElementById('ui-layer')?.appendChild(el);
    return el;
  })();

  panel.innerHTML = '';
  if (!sys) { panel.style.display = 'none'; return panel; }
  panel.style.display = 'block';

  const hazardName = ['Safe', 'Low Risk', 'Moderate', 'Dangerous', 'Null-Sec'][sys.hazardLevel] ?? 'Unknown';
  const factionDef = FACTION_DEFS[sys.faction];
  const hazardHex  = HAZARD_COLORS[sys.hazardLevel].toString(16).padStart(6, '0');
  const factionHex = factionDef.color.toString(16).padStart(6, '0');

  panel.innerHTML = `
    <div class="galaxy-info-title">${sys.name}</div>
    <div class="galaxy-info-row"><span>Type</span><span>${sys.starType.replace('_', ' ')}</span></div>
    <div class="galaxy-info-row"><span>Faction</span><span style="color:#${factionHex}">${factionDef.name}</span></div>
    <div class="galaxy-info-row"><span>Hazard</span><span style="color:#${hazardHex}">${hazardName}</span></div>
    <div class="galaxy-info-row"><span>Stations</span><span>${sys.stations.length || '—'}</span></div>
    <div class="galaxy-info-row"><span>Belts</span><span>${sys.asteroidBelts.length || '—'}</span></div>
    ${sys.anomalies.map(a =>
      `<div class="galaxy-info-row anomaly"><span>⚠ Anomaly</span><span>${a.discovered ? a.type.replace(/_/g,' ') : '???'}</span></div>`
    ).join('')}
    ${sys.isPirateZone ? `<div class="galaxy-info-warn">⚠ Pirate Zone</div>` : ''}
    ${sys.isNebula     ? `<div class="galaxy-info-tag">Nebula Region</div>`  : ''}
  `;
  return panel;
}

// ── GalaxyOverlay ─────────────────────────────────────────────────────────────

export class GalaxyOverlay {
  readonly container: Container;
  private backdrop:  Graphics;
  private mapContainer: Container;
  private renderer:  GalaxyRenderer;
  private _visible   = false;
  private _tween: gsap.core.Tween | null = null;
  private _selected: string | null       = null;

  // Callbacks
  private onToggleCbs: Array<(visible: boolean) => void> = [];

  constructor(
    app:       Application,
    galaxy:    GalaxyData,
    fog:       FogOfWar,
    influence: FactionInfluence,
    traffic:   TrafficSystem,
  ) {
    this.container    = new Container();
    this.container.visible = false;
    this.container.alpha   = 0;
    this.container.eventMode = 'static';
    app.stage.addChild(this.container);

    // Dark backdrop
    this.backdrop = new Graphics();
    this.backdrop.rect(0, 0, app.screen.width, app.screen.height);
    this.backdrop.fill({ color: 0x000000, alpha: 0.75 });
    this.container.addChild(this.backdrop);

    // Galaxy map centred on screen
    this.mapContainer = new Container();
    this.mapContainer.x = (app.screen.width  - MAP_PX) * 0.5;
    this.mapContainer.y = (app.screen.height - MAP_PX) * 0.5;
    this.container.addChild(this.mapContainer);

    // Border frame
    const frame = new Graphics();
    frame.rect(-MAP_PAD, -MAP_PAD, MAP_PX + MAP_PAD * 2, MAP_PX + MAP_PAD * 2);
    frame.stroke({ width: 1, color: 0x334455, alpha: 0.8 });
    this.mapContainer.addChild(frame);

    // Galaxy renderer
    this.renderer = new GalaxyRenderer(galaxy, fog, influence, traffic);
    this.mapContainer.addChild(this.renderer.container);

    // Click events on the map
    this.renderer.container.eventMode = 'static';
    this.renderer.container.on('pointerdown', (e) => {
      const local = e.getLocalPosition(this.renderer.container);
      const hit   = this.renderer.hitTest(local.x, local.y);
      this._selectSystem(hit);
    });

    // ESC closes overlay
    window.addEventListener('keydown', this._onKey.bind(this));

    this._injectStyles();
  }

  // ── Update ────────────────────────────────────────────────────────────────

  /** Call each render frame when overlay is visible. */
  update(dt: number, playerGx: number, playerGy: number): void {
    if (!this._visible) return;
    this.renderer.update(dt, playerGx, playerGy);
  }

  // ── Toggle ────────────────────────────────────────────────────────────────

  toggle(): void {
    this._visible ? this.hide() : this.show();
  }

  show(): void {
    if (this._visible) return;
    this._visible = true;
    this.container.visible = true;
    this._tween?.kill();
    this._tween = gsap.to(this.container, { alpha: 1, duration: 0.25, ease: 'power2.out' });
    this.renderer.setDirty();
    for (const cb of this.onToggleCbs) cb(true);
  }

  hide(): void {
    if (!this._visible) return;
    this._visible = false;
    this._tween?.kill();
    this._tween = gsap.to(this.container, {
      alpha: 0, duration: 0.2, ease: 'power2.in',
      onComplete: () => { this.container.visible = false; },
    });
    buildInfoPanel(null);
    for (const cb of this.onToggleCbs) cb(false);
  }

  get isVisible(): boolean { return this._visible; }

  onToggle(cb: (visible: boolean) => void): () => void {
    this.onToggleCbs.push(cb);
    return () => {
      const i = this.onToggleCbs.indexOf(cb);
      if (i !== -1) this.onToggleCbs.splice(i, 1);
    };
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  private _selectSystem(sys: StarSystem | null): void {
    this._selected = sys?.id ?? null;
    this.renderer.setSelected(this._selected);
    buildInfoPanel(sys);
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private _onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') {
      this.toggle();
    }
  }

  // ── CSS ───────────────────────────────────────────────────────────────────

  private _injectStyles(): void {
    if (document.getElementById('galaxy-overlay-styles')) return;
    const style = document.createElement('style');
    style.id    = 'galaxy-overlay-styles';
    style.textContent = `
      #galaxy-info-panel {
        position: absolute; right: 24px; top: 50%;
        transform: translateY(-50%);
        width: ${PANEL_W}px;
        background: rgba(5, 12, 24, 0.92);
        border: 1px solid #334455;
        border-radius: 4px;
        padding: 12px 14px;
        font-family: monospace;
        font-size: 11px;
        color: #aabbcc;
        pointer-events: none;
        display: none;
        z-index: 200;
      }
      .galaxy-info-title { font-size: 14px; color: #ffffff; margin-bottom: 8px; letter-spacing: 1px; }
      .galaxy-info-row { display: flex; justify-content: space-between; margin: 3px 0; }
      .galaxy-info-row span:last-child { color: #cce8ff; }
      .galaxy-info-warn { margin-top: 6px; color: #ff4400; }
      .galaxy-info-tag  { margin-top: 4px; color: #8844ff; }
      .anomaly span:last-child { color: #ffaa00 !important; }
    `;
    document.head.appendChild(style);
  }

  destroy(): void {
    window.removeEventListener('keydown', this._onKey.bind(this));
    this.renderer.destroy();
    this.container.destroy({ children: true });
    buildInfoPanel(null);
  }
}
