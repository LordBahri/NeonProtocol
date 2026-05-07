import { gsap } from 'gsap';
import { injectTheme } from './UITheme.ts';
import { globalBus } from '../../core/network/MessageBus.ts';
import { useEconomyStore } from '../economy/InventoryStore.ts';

// ── SVG arc helper ────────────────────────────────────────────────────────────

function arcPath(cx: number, cy: number, r: number, frac: number): string {
  const start = -Math.PI / 2;
  const end   = start + Math.max(0.001, Math.min(1, frac)) * Math.PI * 2;
  if (frac >= 0.9999) return `M ${cx},${cy - r} A ${r},${r} 0 1 1 ${cx - 0.001},${cy - r} Z`;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  const large = frac > 0.5 ? 1 : 0;
  return `M ${x1},${y1} A ${r},${r} 0 ${large} 1 ${x2},${y2}`;
}

function fmtISK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

// ── HolographicHUD ────────────────────────────────────────────────────────────

export class HolographicHUD {
  private root:     HTMLElement;
  private notifWrap: HTMLElement;
  private _notifY = 0;

  // Arc SVG elements (shield / armor / hull / capacitor)
  private arcShield!: SVGPathElement;
  private arcArmor!:  SVGPathElement;
  private arcHull!:   SVGPathElement;
  private arcCap!:    SVGPathElement;

  // Status text
  private txtShield!:  HTMLElement;
  private txtHull!:    HTMLElement;
  private txtSpeed!:   HTMLElement;
  private txtFPS!:     HTMLElement;
  private txtPing!:    HTMLElement;
  private txtPlayers!: HTMLElement;
  private txtSector!:  HTMLElement;
  private txtCredits!: HTMLElement;

  // Target panel
  private targetWrap!:   HTMLElement;
  private txtTargetName!: HTMLElement;
  private barTShield!:   HTMLElement;
  private barTHull!:     HTMLElement;
  private txtTDist!:     HTMLElement;

  // Capacitor value (0–1) for arc rendering
  private _capFrac = 0.85;

  constructor(uiLayer: HTMLElement) {
    injectTheme();

    this.root = document.createElement('div');
    this.root.style.cssText = `
      position:absolute;inset:0;pointer-events:none;
      font-family:'Courier New',monospace;
    `;
    uiLayer.appendChild(this.root);

    this.notifWrap = document.createElement('div');
    this.notifWrap.style.cssText = `
      position:absolute;right:280px;bottom:175px;
      width:280px;pointer-events:none;
    `;
    this.root.appendChild(this.notifWrap);

    this._buildStatusPanel();
    this._buildTargetPanel();
    this._buildTopBar();
    this._buildDiagPanel();
    this._buildCrosshair();
    this._buildDamageFlash();
    this._subscribeEvents();
  }

  // ── Status panel — bottom left ─────────────────────────────────────────────

  private _buildStatusPanel(): void {
    const SZ = 148;
    const CX = SZ / 2;
    const CY = SZ / 2;

    const panel = document.createElement('div');
    panel.className = 'holo-panel';
    panel.style.cssText = `
      bottom:18px;left:18px;
      width:${SZ + 100}px;
      padding:12px 14px 10px;
      clip-path:polygon(0 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%);
    `;
    panel.innerHTML = `
      <div style="position:absolute;top:5px;left:5px;width:10px;height:10px;border-top:1px solid #00ccff;border-left:1px solid #00ccff;"></div>
      <div style="position:absolute;top:5px;right:5px;width:10px;height:10px;border-top:1px solid #00ccff;border-right:1px solid #00ccff;"></div>
      <div style="position:absolute;bottom:5px;left:5px;width:10px;height:10px;border-bottom:1px solid #00ccff;border-left:1px solid #00ccff;"></div>
    `;

    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:12px;`;

    // ── SVG rings ─────────────────────────────────────────────────────
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width',  String(SZ));
    svg.setAttribute('height', String(SZ));
    svg.style.flexShrink = '0';

    // Background ring tracks
    for (const [r, w] of [[58, 8], [45, 7], [32, 6], [18, 5]] as [number,number][]) {
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bg.setAttribute('cx', String(CX)); bg.setAttribute('cy', String(CY));
      bg.setAttribute('r',  String(r));  bg.setAttribute('fill', 'none');
      bg.setAttribute('stroke', 'rgba(0,30,50,0.85)'); bg.setAttribute('stroke-width', String(w));
      svg.appendChild(bg);
    }

    const mkArc = (color: string, glow: string, strokeW: number): SVGPathElement => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', color);
      p.setAttribute('stroke-width', String(strokeW));
      p.setAttribute('stroke-linecap', 'round');
      p.style.filter = `drop-shadow(0 0 3px ${glow})`;
      svg.appendChild(p);
      return p;
    };

    this.arcShield = mkArc('#00aaff', '#0077ee', 7);
    this.arcArmor  = mkArc('#ffaa00', '#ee7700', 6);
    this.arcHull   = mkArc('#00ff88', '#00dd66', 5);
    this.arcCap    = mkArc('#aaff00', '#88ee00', 4);

    // Center label
    const capLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    capLabel.setAttribute('x', String(CX)); capLabel.setAttribute('y', String(CY + 4));
    capLabel.setAttribute('text-anchor', 'middle');
    capLabel.setAttribute('font-family', 'Courier New');
    capLabel.setAttribute('font-size', '7');
    capLabel.setAttribute('fill', 'rgba(0,200,160,0.55)');
    capLabel.textContent = 'CAP';
    svg.appendChild(capLabel);

    row.appendChild(svg);

    // ── Text labels ───────────────────────────────────────────────────
    const textBlock = document.createElement('div');
    textBlock.style.cssText = `flex:1;display:flex;flex-direction:column;gap:7px;`;
    textBlock.innerHTML = `
      <div>
        <div class="holo-label" style="margin-bottom:2px;">SHIELD</div>
        <div id="hud-shield" style="color:#00aaff;font-size:14px;font-weight:bold;text-shadow:0 0 8px #0088ff;">100</div>
      </div>
      <div>
        <div class="holo-label" style="margin-bottom:2px;">ARMOR</div>
        <div id="hud-armor" style="color:#ffaa00;font-size:14px;font-weight:bold;text-shadow:0 0 8px #ee8800;">100</div>
      </div>
      <div>
        <div class="holo-label" style="margin-bottom:2px;">HULL</div>
        <div id="hud-hull" style="color:#00ff88;font-size:14px;font-weight:bold;text-shadow:0 0 8px #00dd66;">100</div>
      </div>
      <div style="border-top:1px solid rgba(0,140,180,0.14);padding-top:6px;display:flex;gap:5px;align-items:baseline;">
        <span class="holo-label">SPD</span>
        <span id="hud-speed" style="color:#00eeff;font-size:15px;text-shadow:0 0 10px #00eeff;">0</span>
        <span class="holo-label">m/s</span>
      </div>
    `;
    row.appendChild(textBlock);
    panel.appendChild(row);

    // Credits row
    const credRow = document.createElement('div');
    credRow.style.cssText = `
      margin-top:8px;padding-top:6px;
      border-top:1px solid rgba(0,120,160,0.14);
      display:flex;justify-content:space-between;align-items:center;
    `;
    credRow.innerHTML = `
      <span class="holo-label">BALANCE</span>
      <span id="hud-credits" style="color:#aaff44;font-size:11px;text-shadow:0 0 6px #88ff00;">50,000 ISK</span>
    `;
    panel.appendChild(credRow);
    this.root.appendChild(panel);

    this.txtShield  = panel.querySelector('#hud-shield')!;
    this.txtHull    = panel.querySelector('#hud-hull')!;
    this.txtSpeed   = panel.querySelector('#hud-speed')!;
    this.txtCredits = panel.querySelector('#hud-credits')!;

    this._renderArcs(1, 1, 1, this._capFrac);
  }

  // ── Target panel — bottom right ────────────────────────────────────────────

  private _buildTargetPanel(): void {
    this.targetWrap = document.createElement('div');
    this.targetWrap.className = 'holo-panel';
    this.targetWrap.style.cssText = `
      bottom:18px;right:170px;
      width:200px;
      padding:12px 14px;
      clip-path:polygon(10px 0,100% 0,100% 100%,0 100%,0 10px);
      display:none;
    `;
    this.targetWrap.innerHTML = `
      <div style="position:absolute;top:5px;right:5px;width:8px;height:8px;border-top:1px solid #00ccff;border-right:1px solid #00ccff;"></div>
      <div class="holo-label" style="margin-bottom:2px;">TARGET LOCKED</div>
      <div id="hud-t-name" style="font-size:12px;color:#ff6644;margin-bottom:8px;text-shadow:0 0 8px #ff4422;letter-spacing:1px;">---</div>
      <div class="holo-label" style="margin-bottom:2px;">SHIELD</div>
      <div class="holo-bar-track" style="margin-bottom:6px;">
        <div id="hud-t-shield" class="holo-bar-fill" style="width:100%;background:#0066ff;box-shadow:0 0 4px #0044cc;"></div>
      </div>
      <div class="holo-label" style="margin-bottom:2px;">HULL</div>
      <div class="holo-bar-track" style="margin-bottom:7px;">
        <div id="hud-t-hull" class="holo-bar-fill" style="width:100%;background:#ff5500;box-shadow:0 0 4px #ff3300;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="holo-label">RANGE</span>
        <span id="hud-t-dist" style="color:#ff8844;font-size:10px;text-shadow:0 0 5px #ff6622;">--- m</span>
      </div>
    `;
    this.root.appendChild(this.targetWrap);

    this.txtTargetName = this.targetWrap.querySelector('#hud-t-name')!;
    this.barTShield    = this.targetWrap.querySelector('#hud-t-shield')!;
    this.barTHull      = this.targetWrap.querySelector('#hud-t-hull')!;
    this.txtTDist      = this.targetWrap.querySelector('#hud-t-dist')!;
  }

  // ── Top bar ────────────────────────────────────────────────────────────────

  private _buildTopBar(): void {
    const bar = document.createElement('div');
    bar.style.cssText = `
      position:absolute;top:0;left:50%;transform:translateX(-50%);
      display:flex;flex-direction:column;align-items:center;
      pointer-events:none;padding-top:10px;
    `;
    bar.innerHTML = `
      <div style="font-size:7px;letter-spacing:5px;color:rgba(0,70,96,0.55);margin-bottom:2px;">NEON PROTOCOL</div>
      <div id="hud-sector" style="font-size:11px;letter-spacing:4px;color:rgba(0,160,200,0.65);text-shadow:0 0 10px rgba(0,160,200,0.35);">SECTOR-001</div>
      <div style="display:flex;gap:16px;margin-top:5px;" id="hud-shortcuts-hint">
        <span style="font-size:7px;letter-spacing:1px;color:rgba(0,100,130,0.4);">[I] INV</span>
        <span style="font-size:7px;letter-spacing:1px;color:rgba(0,100,130,0.4);">[F] FIT</span>
        <span style="font-size:7px;letter-spacing:1px;color:rgba(0,100,130,0.4);">[C] CORP</span>
        <span style="font-size:7px;letter-spacing:1px;color:rgba(0,100,130,0.4);">[M] MAP</span>
        <span style="font-size:7px;letter-spacing:1px;color:rgba(0,100,130,0.4);">[E] MARKET</span>
      </div>
    `;
    this.root.appendChild(bar);
    this.txtSector = bar.querySelector('#hud-sector')!;
  }

  // ── Diagnostics panel — top right ──────────────────────────────────────────

  private _buildDiagPanel(): void {
    const diag = document.createElement('div');
    diag.className = 'holo-panel';
    diag.style.cssText = `
      top:14px;right:14px;
      padding:9px 13px;text-align:right;min-width:110px;
      clip-path:polygon(10px 0,100% 0,100% 100%,0 100%,0 10px);
    `;
    diag.innerHTML = `
      <div style="position:absolute;top:4px;right:4px;width:8px;height:8px;border-top:1px solid #00ccff;border-right:1px solid #00ccff;"></div>
      <div style="margin-bottom:3px;"><span class="holo-label">FPS </span><span id="hud-fps" class="holo-value">60</span></div>
      <div style="margin-bottom:3px;"><span class="holo-label">PING </span><span id="hud-ping" class="holo-value">0</span><span class="holo-label">ms</span></div>
      <div><span class="holo-label">ONLINE </span><span id="hud-players" class="holo-value">1</span></div>
    `;
    this.root.appendChild(diag);
    this.txtFPS     = diag.querySelector('#hud-fps')!;
    this.txtPing    = diag.querySelector('#hud-ping')!;
    this.txtPlayers = diag.querySelector('#hud-players')!;
  }

  // ── Crosshair ──────────────────────────────────────────────────────────────

  private _buildCrosshair(): void {
    const ch = document.createElement('div');
    ch.style.cssText = `
      position:absolute;top:50%;left:50%;
      transform:translate(-50%,-50%);
      width:36px;height:36px;pointer-events:none;
    `;
    ch.innerHTML = `<svg width="36" height="36" viewBox="0 0 36 36">
      <path d="M4,11 L4,4 L11,4"   fill="none" stroke="rgba(0,220,255,0.45)" stroke-width="1.5"/>
      <path d="M25,4  L32,4  L32,11" fill="none" stroke="rgba(0,220,255,0.45)" stroke-width="1.5"/>
      <path d="M4,25  L4,32  L11,32" fill="none" stroke="rgba(0,220,255,0.45)" stroke-width="1.5"/>
      <path d="M25,32 L32,32 L32,25" fill="none" stroke="rgba(0,220,255,0.45)" stroke-width="1.5"/>
      <circle cx="18" cy="18" r="1.5" fill="rgba(0,220,255,0.55)"/>
    </svg>`;
    this.root.appendChild(ch);
  }

  // ── Damage flash overlay ───────────────────────────────────────────────────

  private _buildDamageFlash(): void {
    const f = document.createElement('div');
    f.id = 'hud-flash';
    f.style.cssText = `
      position:absolute;inset:0;pointer-events:none;opacity:0;
      background:radial-gradient(ellipse at center,rgba(255,20,0,0.22) 0%,rgba(255,0,0,0.08) 60%,transparent 100%);
      box-shadow:inset 0 0 80px rgba(255,0,0,0.32);
    `;
    this.root.appendChild(f);
  }

  // ── Arc renderer ───────────────────────────────────────────────────────────

  private _renderArcs(sFrac: number, aFrac: number, hFrac: number, cFrac: number): void {
    const CX = 74; const CY = 74;
    this.arcShield.setAttribute('d', arcPath(CX, CY, 58, sFrac));
    this.arcArmor.setAttribute('d',  arcPath(CX, CY, 45, aFrac));
    this.arcHull.setAttribute('d',   arcPath(CX, CY, 32, hFrac));
    this.arcCap.setAttribute('d',    arcPath(CX, CY, 18, cFrac));

    const hullColor = hFrac > 0.50 ? '#00ff88' : hFrac > 0.25 ? '#ffaa00' : '#ff2244';
    const hullGlow  = hFrac > 0.50 ? '#00dd66' : hFrac > 0.25 ? '#ee8800' : '#ff2244';
    this.arcHull.setAttribute('stroke', hullColor);
    this.arcHull.style.filter = `drop-shadow(0 0 3px ${hullGlow})`;
  }

  // ── Event subscriptions ────────────────────────────────────────────────────

  private _subscribeEvents(): void {
    globalBus.on('contract:completed', (d: unknown) => {
      const { reward } = d as { reward: number };
      this.notify(`CONTRACT COMPLETE  +${fmtISK(reward)} ISK`, '#aaff44');
    });
    globalBus.on('asteroid:mined', (d: unknown) => {
      const { qty, oreType } = d as { qty: number; oreType: string };
      if (qty > 0) this.notify(`+${qty}  ${oreType.toUpperCase()}`, '#aaffcc');
    });
    globalBus.on('asteroid:depleted', () => this.notify('ASTEROID DEPLETED', '#ffaa00'));
    globalBus.on('industry:job_complete', (d: unknown) => {
      const { output } = d as { output: Record<string, number> };
      const s = Object.entries(output).map(([k, v]) => `${v}×${k}`).join(', ');
      this.notify(`JOB COMPLETE: ${s}`, '#00ffcc');
    });
    globalBus.on('contract:failed', () => this.notify('CONTRACT FAILED', '#ff3344'));
  }

  // ── Public update API ──────────────────────────────────────────────────────

  updateShipStats(hull: number, maxHull: number, shield: number, maxShield: number): void {
    const sFrac = shield / maxShield;
    const hFrac = hull   / maxHull;
    this._renderArcs(sFrac, 1.0, hFrac, this._capFrac);

    this.txtShield.textContent = Math.round(shield).toString();
    this.txtHull.textContent   = Math.round(hull).toString();
  }

  updateSpeed(speed: number): void {
    this.txtSpeed.textContent = Math.round(speed).toString();
  }

  updateFPS(fps: number): void {
    this.txtFPS.textContent = Math.round(fps).toString();
    this.txtFPS.style.color = fps >= 55 ? '#00eeff' : fps >= 30 ? '#ffaa00' : '#ff3300';
  }

  updatePing(ms: number): void {
    this.txtPing.textContent = ms.toString();
    this.txtPing.style.color = ms < 80 ? '#00eeff' : ms < 150 ? '#ffaa00' : '#ff3300';
  }

  updateSector(name: string): void { this.txtSector.textContent = name; }

  updatePlayerCount(n: number): void { this.txtPlayers.textContent = String(n); }

  updateCredits(amount: number): void {
    this.txtCredits.textContent = `${fmtISK(amount)} ISK`;
  }

  /** Pull credits from economy store each frame. */
  tickCredits(): void {
    const credits = useEconomyStore.getState().credits;
    this.updateCredits(credits);
  }

  updateTarget(name: string, shieldFrac: number, hullFrac: number, dist: number): void {
    this.targetWrap.style.display = 'block';
    this.txtTargetName.textContent = name;
    this.barTShield.style.width   = `${Math.round(shieldFrac * 100)}%`;
    this.barTHull.style.width     = `${Math.round(hullFrac   * 100)}%`;
    this.txtTDist.textContent     = dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`;
  }

  clearTarget(): void { this.targetWrap.style.display = 'none'; }

  flashDamage(): void {
    const f = document.getElementById('hud-flash');
    if (f) gsap.fromTo(f, { opacity: 1 }, { opacity: 0, duration: 0.55, ease: 'power2.out' });
  }

  notify(msg: string, color = '#00eeff'): void {
    const n = document.createElement('div');
    n.className = 'holo-notification';
    n.style.color       = color;
    n.style.textShadow  = `0 0 7px ${color}`;
    n.style.bottom      = `${this._notifY}px`;
    n.textContent = msg;
    this.notifWrap.appendChild(n);
    this._notifY += 22;
    if (this._notifY > 140) this._notifY = 0;
    setTimeout(() => { n.remove(); this._notifY = Math.max(0, this._notifY - 22); }, 2400);
  }

  destroy(): void { this.root.remove(); }
}
