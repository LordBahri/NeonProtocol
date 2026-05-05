import { Container, Graphics, BlurFilter } from 'pixi.js';

interface Fog {
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

const COLORS = [0x0a0820, 0x050a1a, 0x080515, 0x050810, 0x0a0515];
const COUNT  = 24;

function lcg(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

/**
 * Slow-drifting volumetric fog patches rendered as blurred Graphics,
 * positioned in screen space and wrapping at viewport edges.
 */
export class FogCloud {
  readonly container: Container;
  private fogs: Fog[] = [];
  private screenW = 1;
  private screenH = 1;

  constructor() {
    this.container       = new Container();
    this.container.label = 'fog';
    this.container.eventMode = 'none';
    // One shared BlurFilter on the whole container — far cheaper than per-patch
    this.container.filters = [new BlurFilter({ strength: 55, quality: 3 })];
  }

  init(width: number, height: number, seed = 31337): void {
    this.screenW = width;
    this.screenH = height;

    for (const f of this.fogs) f.gfx.destroy();
    this.fogs = [];
    this.container.removeChildren();

    const rand = lcg(seed);

    for (let i = 0; i < COUNT; i++) {
      const radius = 160 + rand() * 260;
      const alpha  = 0.04 + rand() * 0.07;
      const color  = COLORS[Math.floor(rand() * COLORS.length)]!;
      const x      = rand() * width;
      const y      = rand() * height;

      const gfx = new Graphics();
      this.drawFog(gfx, radius, color, alpha);
      gfx.x = x;
      gfx.y = y;
      gfx.eventMode = 'none';

      this.container.addChild(gfx);
      this.fogs.push({
        gfx,
        x, y,
        vx: (rand() - 0.5) * 3.5,
        vy: (rand() - 0.5) * 3.5,
        radius,
        alpha,
      });
    }
  }

  private drawFog(gfx: Graphics, radius: number, color: number, maxAlpha: number): void {
    const RINGS = 6;
    for (let r = RINGS; r > 0; r--) {
      const frac  = r / RINGS;
      const alpha = maxAlpha * (1 - frac) * frac * 4;
      gfx.ellipse(0, 0, radius * frac, radius * frac * (0.6 + frac * 0.3));
      gfx.fill({ color, alpha });
    }
  }

  update(dt: number): void {
    for (const fog of this.fogs) {
      fog.x += fog.vx * dt;
      fog.y += fog.vy * dt;

      // Wrap around screen edges
      const pad = fog.radius;
      if (fog.x > this.screenW + pad) fog.x -= this.screenW + pad * 2;
      if (fog.x < -pad)              fog.x += this.screenW + pad * 2;
      if (fog.y > this.screenH + pad) fog.y -= this.screenH + pad * 2;
      if (fog.y < -pad)              fog.y += this.screenH + pad * 2;

      fog.gfx.x = fog.x;
      fog.gfx.y = fog.y;
    }
  }

  resize(width: number, height: number): void {
    this.screenW = width;
    this.screenH = height;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
