import { gsap } from 'gsap';


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
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      font-family: 'Courier New', monospace;
      color: #00ffcc;
      font-size: 12px;
      text-shadow: 0 0 6px #00ffcc;
    `;
    uiLayer.appendChild(this.container);
    this.buildDOM();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <div style="
        position: absolute;
        bottom: 24px;
        left: 24px;
        width: 220px;
        background: rgba(0,10,20,0.75);
        border: 1px solid #004444;
        padding: 12px;
        box-shadow: 0 0 16px rgba(0,255,204,0.15);
      ">
        <div style="margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>HULL</span>
            <span id="hull-text">100 / 100</span>
          </div>
          <div style="height: 6px; background: #001a1a; border: 1px solid #002222;">
            <div id="hull-bar" style="height: 100%; background: #00ff44; transition: none; box-shadow: 0 0 8px #00ff44;"></div>
          </div>
        </div>
        <div style="margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>SHIELD</span>
            <span id="shield-text">100 / 100</span>
          </div>
          <div style="height: 6px; background: #001a1a; border: 1px solid #002222;">
            <div id="shield-bar" style="height: 100%; background: #00ccff; transition: none; box-shadow: 0 0 8px #00ccff;"></div>
          </div>
        </div>
        <div style="border-top: 1px solid #003333; padding-top: 8px; margin-top: 4px; display: flex; justify-content: space-between;">
          <span>SPD: <span id="speed-text">0</span></span>
          <span id="sector-text" style="color: #0088aa; font-size: 10px;"></span>
        </div>
      </div>

      <div style="
        position: absolute;
        top: 16px;
        right: 16px;
        text-align: right;
        font-size: 10px;
        color: #006655;
        opacity: 0.7;
      ">
        <div>FPS: <span id="fps-text">60</span></div>
        <div>PING: <span id="ping-text">0</span>ms</div>
        <div>PLR: <span id="player-text">1</span></div>
      </div>
    `;

    this.hullBar = this.container.querySelector('#hull-bar')!;
    this.shieldBar = this.container.querySelector('#shield-bar')!;
    this.hullText = this.container.querySelector('#hull-text')!;
    this.shieldText = this.container.querySelector('#shield-text')!;
    this.speedText = this.container.querySelector('#speed-text')!;
    this.fpsText = this.container.querySelector('#fps-text')!;
    this.pingText = this.container.querySelector('#ping-text')!;
    this.sectorText = this.container.querySelector('#sector-text')!;
    this.playerText = this.container.querySelector('#player-text')!;
  }

  updateShipStats(hull: number, maxHull: number, shield: number, maxShield: number): void {
    const hullFrac = hull / maxHull;
    const shieldFrac = shield / maxShield;

    this.hullBar.style.width = `${hullFrac * 100}%`;
    this.shieldBar.style.width = `${shieldFrac * 100}%`;

    const hullColor = hullFrac > 0.5 ? '#00ff44' : hullFrac > 0.25 ? '#ffaa00' : '#ff2200';
    this.hullBar.style.background = hullColor;
    this.hullBar.style.boxShadow = `0 0 8px ${hullColor}`;

    this.hullText.textContent = `${Math.round(hull)} / ${maxHull}`;
    this.shieldText.textContent = `${Math.round(shield)} / ${maxShield}`;
  }

  updateSpeed(speed: number): void {
    this.speedText.textContent = Math.round(speed).toString();
  }

  updateFPS(fps: number): void {
    this.fpsText.textContent = Math.round(fps).toString();
    const color = fps >= 55 ? '#006655' : fps >= 30 ? '#886600' : '#660000';
    this.fpsText.style.color = color;
  }

  updatePing(ms: number): void {
    this.pingText.textContent = ms.toString();
    const color = ms < 80 ? '#006655' : ms < 150 ? '#886600' : '#660000';
    this.pingText.style.color = color;
  }

  updateSector(name: string): void {
    this.sectorText.textContent = name;
  }

  updatePlayerCount(count: number): void {
    this.playerText.textContent = count.toString();
  }

  flashDamage(): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute; inset: 0;
      background: rgba(255,30,0,0.12);
      pointer-events: none;
    `;
    this.container.appendChild(overlay);
    gsap.to(overlay, {
      opacity: 0,
      duration: 0.3,
      onComplete: () => overlay.remove(),
    });
  }

  destroy(): void {
    this.container.remove();
  }
}
