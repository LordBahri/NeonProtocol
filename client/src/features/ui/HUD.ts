import { gsap } from 'gsap';

const CSS = `
  @keyframes neon-flicker {
    0%,100% { opacity: 1; }
    92% { opacity: 1; }
    93% { opacity: 0.7; }
    94% { opacity: 1; }
    97% { opacity: 0.85; }
    98% { opacity: 1; }
  }
  @keyframes scan-line {
    from { top: 0; }
    to   { top: 100%; }
  }
  .hud-panel {
    position: absolute;
    background: rgba(0,8,18,0.82);
    border: 1px solid rgba(0,200,255,0.25);
    box-shadow: 0 0 14px rgba(0,200,255,0.10), inset 0 0 20px rgba(0,10,22,0.6);
    animation: neon-flicker 8s infinite;
  }
  .hud-corner::before, .hud-corner::after {
    content: '';
    position: absolute;
    width: 8px; height: 8px;
    border-color: #00ccff;
    border-style: solid;
  }
  .hud-label {
    font-size: 9px;
    letter-spacing: 2px;
    color: #005566;
    text-transform: uppercase;
    margin-bottom: 3px;
  }
  .bar-track {
    height: 5px;
    background: rgba(0,30,44,0.9);
    border: 1px solid rgba(0,100,120,0.4);
    position: relative;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    transition: width 0.25s ease-out;
    position: relative;
  }
  .bar-fill::after {
    content: '';
    position: absolute;
    right: 0; top: 0; bottom: 0;
    width: 3px;
    background: rgba(255,255,255,0.7);
    filter: blur(1px);
  }
  .bar-scan {
    position: absolute;
    left: 0; right: 0;
    height: 1px;
    background: rgba(255,255,255,0.12);
    animation: scan-line 2.5s linear infinite;
  }
`;

export class HUD {
  private container: HTMLElement;
  private hullBar!: HTMLElement;
  private shieldBar!: HTMLElement;
  private hullText!: HTMLElement;
  private shieldText!: HTMLElement;
  private speedText!: HTMLElement;
  private fpsText!: HTMLElement;
  private pingText!: HTMLElement;
  private sectorText!: HTMLElement;
  private playerText!: HTMLElement;

  constructor(uiLayer: HTMLElement) {
    // Inject keyframe CSS once
    if (!document.getElementById('hud-css')) {
      const style = document.createElement('style');
      style.id = 'hud-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      font-family: 'Courier New', monospace;
      color: #00eeff;
      font-size: 11px;
      text-shadow: 0 0 8px rgba(0,238,255,0.6);
    `;
    uiLayer.appendChild(this.container);
    this.buildDOM();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <!-- Ship status panel — bottom left -->
      <div class="hud-panel" style="
        bottom: 24px; left: 24px;
        width: 210px;
        padding: 14px 14px 12px;
        clip-path: polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
      ">
        <!-- Corner brackets -->
        <div style="position:absolute;top:5px;left:5px;width:10px;height:10px;border-top:1px solid #00ccff;border-left:1px solid #00ccff;"></div>
        <div style="position:absolute;top:5px;right:5px;width:10px;height:10px;border-top:1px solid #00ccff;border-right:1px solid #00ccff;"></div>
        <div style="position:absolute;bottom:5px;left:5px;width:10px;height:10px;border-bottom:1px solid #00ccff;border-left:1px solid #00ccff;"></div>

        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
            <div class="hud-label">HULL INTEGRITY</div>
            <div id="hull-text" style="font-size:10px;color:#00eeff;">100</div>
          </div>
          <div class="bar-track">
            <div id="hull-bar" class="bar-fill" style="width:100%;background:#00ff55;box-shadow:0 0 6px #00ff55;"></div>
            <div class="bar-scan"></div>
          </div>
        </div>

        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
            <div class="hud-label">SHIELD STRENGTH</div>
            <div id="shield-text" style="font-size:10px;color:#00ccff;">100</div>
          </div>
          <div class="bar-track">
            <div id="shield-bar" class="bar-fill" style="width:100%;background:#00aaff;box-shadow:0 0 6px #0088ff;"></div>
            <div class="bar-scan" style="animation-delay:1.25s"></div>
          </div>
        </div>

        <div style="border-top:1px solid rgba(0,180,200,0.18);padding-top:8px;display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#004455;font-size:9px;letter-spacing:1px;">VELOCITY</span>
          <span id="speed-text" style="color:#00eeff;font-size:13px;font-weight:bold;text-shadow:0 0 10px #00eeff;">0</span>
          <span style="color:#002233;font-size:9px;">m/s</span>
        </div>
      </div>

      <!-- Sector info — top center -->
      <div style="
        position:absolute;
        top:18px;
        left:50%;
        transform:translateX(-50%);
        text-align:center;
        pointer-events:none;
      ">
        <div style="font-size:9px;letter-spacing:4px;color:#003344;margin-bottom:2px;">NEON PROTOCOL</div>
        <div id="sector-text" style="font-size:11px;letter-spacing:3px;color:#008899;text-shadow:0 0 8px #008899;">SECTOR-001</div>
      </div>

      <!-- Diagnostics — top right -->
      <div class="hud-panel" style="
        top:18px; right:18px;
        padding:10px 12px;
        text-align:right;
        min-width:110px;
        clip-path:polygon(10px 0,100% 0,100% 100%,0 100%,0 10px);
      ">
        <div style="position:absolute;top:5px;right:5px;width:10px;height:10px;border-top:1px solid #00ccff;border-right:1px solid #00ccff;"></div>
        <div style="margin-bottom:4px;">
          <span style="color:#003344;font-size:9px;letter-spacing:1px;">FPS </span>
          <span id="fps-text" style="color:#00eeff;">60</span>
        </div>
        <div style="margin-bottom:4px;">
          <span style="color:#003344;font-size:9px;letter-spacing:1px;">PING </span>
          <span id="ping-text" style="color:#00eeff;">0</span>
          <span style="color:#002233;font-size:9px;">ms</span>
        </div>
        <div>
          <span style="color:#003344;font-size:9px;letter-spacing:1px;">PILOTS </span>
          <span id="player-text" style="color:#00eeff;">1</span>
        </div>
      </div>

      <!-- Full-screen damage flash -->
      <div id="damage-flash" style="position:absolute;inset:0;pointer-events:none;opacity:0;
        background:radial-gradient(ellipse at center, rgba(255,20,0,0.22) 0%, rgba(255,0,0,0.08) 60%, transparent 100%);
        box-shadow:inset 0 0 80px rgba(255,0,0,0.35);
      "></div>
    `;

    this.hullBar    = this.container.querySelector('#hull-bar')!;
    this.shieldBar  = this.container.querySelector('#shield-bar')!;
    this.hullText   = this.container.querySelector('#hull-text')!;
    this.shieldText = this.container.querySelector('#shield-text')!;
    this.speedText  = this.container.querySelector('#speed-text')!;
    this.fpsText    = this.container.querySelector('#fps-text')!;
    this.pingText   = this.container.querySelector('#ping-text')!;
    this.sectorText = this.container.querySelector('#sector-text')!;
    this.playerText = this.container.querySelector('#player-text')!;
  }

  updateShipStats(hull: number, maxHull: number, shield: number, maxShield: number): void {
    const hullFrac   = hull   / maxHull;
    const shieldFrac = shield / maxShield;

    this.hullBar.style.width  = `${hullFrac   * 100}%`;
    this.shieldBar.style.width = `${shieldFrac * 100}%`;

    const hullColor = hullFrac > 0.5 ? '#00ff55' : hullFrac > 0.25 ? '#ffaa00' : '#ff2200';
    const hullGlow  = hullFrac > 0.5 ? '#00ff55' : hullFrac > 0.25 ? '#ffaa00' : '#ff2200';
    this.hullBar.style.background  = hullColor;
    this.hullBar.style.boxShadow   = `0 0 8px ${hullGlow}`;

    this.hullText.textContent   = Math.round(hull).toString();
    this.shieldText.textContent = Math.round(shield).toString();
  }

  updateSpeed(speed: number): void {
    this.speedText.textContent = Math.round(speed).toString();
  }

  updateFPS(fps: number): void {
    this.fpsText.textContent = Math.round(fps).toString();
    this.fpsText.style.color = fps >= 55 ? '#00eeff' : fps >= 30 ? '#ffaa00' : '#ff3300';
  }

  updatePing(ms: number): void {
    this.pingText.textContent = ms.toString();
    this.pingText.style.color = ms < 80 ? '#00eeff' : ms < 150 ? '#ffaa00' : '#ff3300';
  }

  updateSector(name: string): void {
    this.sectorText.textContent = name;
  }

  updatePlayerCount(count: number): void {
    this.playerText.textContent = count.toString();
  }

  flashDamage(): void {
    const overlay = this.container.querySelector('#damage-flash') as HTMLElement;
    gsap.fromTo(overlay, { opacity: 1 }, { opacity: 0, duration: 0.55, ease: 'power2.out' });
  }

  destroy(): void {
    this.container.remove();
  }
}
