import { Container, Graphics } from 'pixi.js';
import { StarfieldLayer } from './StarfieldLayer.ts';
import type { RenderPipeline } from '../../core/renderer/RenderPipeline.ts';
import { RenderLayer } from '../../core/renderer/LayerManager.ts';

interface NebulaCloud {
  container: Container;
  baseX: number; baseY: number;
  phase: number;
  driftAX: number; driftAY: number;
  freqX: number;  freqY: number;
  parallax: number;
}

interface DustParticle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; alpha: number;
}

// Large nebula clouds in world-space with low parallax (appear nearly stationary).
const CLOUD_DEFS = [
  { x:     0, y:     0, r: 1900, col: 0x001e3a, maxA: 0.55, dax: 70, day: 50, f: 0.018, p: 0.04 },
  { x:  1200, y:  -850, r: 1500, col: 0x18002e, maxA: 0.50, dax: 55, day: 65, f: 0.022, p: 0.05 },
  { x:  -950, y:   650, r: 1300, col: 0x001f4a, maxA: 0.48, dax: 60, day: 40, f: 0.016, p: 0.03 },
  { x:   550, y:  1100, r: 1100, col: 0x1e0018, maxA: 0.44, dax: 45, day: 70, f: 0.025, p: 0.045 },
  { x:  -750, y:  -750, r: 1200, col: 0x00150f, maxA: 0.40, dax: 65, day: 50, f: 0.020, p: 0.035 },
  { x:  -200, y:  -400, r:  700, col: 0x001f3c, maxA: 0.65, dax: 35, day: 30, f: 0.035, p: 0.060 },
  { x:  -420, y:   380, r:  600, col: 0x240016, maxA: 0.55, dax: 40, day: 35, f: 0.030, p: 0.055 },
  { x:   200, y:   900, r:  800, col: 0x1a0c00, maxA: 0.32, dax: 50, day: 45, f: 0.028, p: 0.040 },
] as const;

function lcg(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223;
    return (s >>> 0) / 0xffffffff;
  };
}

export class BackgroundRenderer {
  private readonly pipeline: RenderPipeline;
  private starfield: StarfieldLayer;
  private bgLayer: Container;
  private clouds: NebulaCloud[] = [];
  private dustGfx: Graphics;
  private dustParticles: DustParticle[] = [];
  private time = 0;

  constructor(pipeline: RenderPipeline) {
    this.pipeline  = pipeline;
    this.bgLayer   = pipeline.layers.get(RenderLayer.BACKGROUND);
    this.starfield = new StarfieldLayer(12345);
    this.bgLayer.addChild(this.starfield.container);

    // Dust lives on app.stage (screen-space, not world-space)
    this.dustGfx = new Graphics();
    this.dustGfx.label = 'space_dust';
    this.dustGfx.blendMode = 'add';
    pipeline.app.stage.addChild(this.dustGfx);
  }

  init(viewW: number, viewH: number): void {
    this.buildNebula();
    this.buildDust(viewW, viewH);
    this.starfield.generate(viewW, viewH);
  }

  private buildNebula(): void {
    let phaseOff = 0;
    for (const def of CLOUD_DEFS) {
      const g = new Graphics();
      g.blendMode = 'add';

      const rings = 14;
      for (let i = rings; i >= 1; i--) {
        const frac    = i / rings;
        const r       = def.r * frac;
        const falloff = Math.pow(1 - frac, 1.8);
        const a       = def.maxA * falloff;
        if (a > 0.004) {
          g.circle(0, 0, r);
          g.fill({ color: def.col, alpha: a });
        }
      }

      const cont = new Container();
      cont.addChild(g);
      cont.x = def.x;
      cont.y = def.y;
      this.bgLayer.addChild(cont);

      this.clouds.push({
        container: cont,
        baseX: def.x, baseY: def.y,
        phase:   phaseOff,
        driftAX: def.dax, driftAY: def.day,
        freqX:   def.f,   freqY: def.f * 0.71,
        parallax: def.p,
      });
      phaseOff += 0.87;
    }
  }

  private buildDust(w: number, h: number): void {
    const rng = lcg(99);
    for (let i = 0; i < 130; i++) {
      this.dustParticles.push({
        x:     rng() * w,
        y:     rng() * h,
        vx:    (rng() - 0.5) * 9,
        vy:    (rng() - 0.5) * 9,
        size:  0.25 + rng() * 0.85,
        alpha: 0.10 + rng() * 0.25,
      });
    }
  }

  update(camX: number, camY: number, dt: number): void {
    this.time += dt;
    const s = this.pipeline.screen;

    for (const c of this.clouds) {
      const dx = Math.sin(this.time * c.freqX + c.phase) * c.driftAX;
      const dy = Math.cos(this.time * c.freqY + c.phase * 1.3) * c.driftAY;
      // Low parallax keeps nebula nearly stationary relative to camera
      c.container.x = c.baseX + dx + camX * (1 - c.parallax);
      c.container.y = c.baseY + dy + camY * (1 - c.parallax);
    }

    this.starfield.update(camX, camY, dt);

    const sw = s.width;
    const sh = s.height;
    this.dustGfx.clear();
    for (const p of this.dustParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < 0) p.x += sw;
      else if (p.x > sw) p.x -= sw;
      if (p.y < 0) p.y += sh;
      else if (p.y > sh) p.y -= sh;
      this.dustGfx.circle(p.x, p.y, p.size);
      this.dustGfx.fill({ color: 0x7799bb, alpha: p.alpha });
    }
  }

  destroy(): void {
    if (this.dustGfx.parent) this.dustGfx.parent.removeChild(this.dustGfx);
    this.dustGfx.destroy();
  }
}
