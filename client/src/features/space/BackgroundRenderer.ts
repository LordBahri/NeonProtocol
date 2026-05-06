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

interface Wisp {
  container: Container;
  baseX: number; baseY: number;
  vx: number; vy: number;   // very slow drift in world units/s (0.1–0.4)
  parallax: number;          // very low (0.02–0.05)
}

interface DustParticle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; alpha: number;
}

interface DustLayer {
  gfx: Graphics;
  particles: DustParticle[];
  color: number;
  speed: number;  // velocity multiplier
}

interface Sparkle {
  x: number; y: number;
  size: number;
  phase: number;
  speed: number;
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

const WISP_COLORS = [0x0e1a2a, 0x0a0018, 0x001a14, 0x1a0a00] as const;

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
  private wisps: Wisp[] = [];
  private dustLayers: DustLayer[] = [];
  private sparkleGfx: Graphics;
  private sparkles: Sparkle[] = [];
  private time = 0;

  constructor(pipeline: RenderPipeline) {
    this.pipeline  = pipeline;
    this.bgLayer   = pipeline.layers.get(RenderLayer.BACKGROUND);
    this.starfield = new StarfieldLayer(12345);
    this.bgLayer.addChild(this.starfield.container);

    // Sparkle overlay lives on app.stage (screen-space)
    this.sparkleGfx = new Graphics();
    this.sparkleGfx.label = 'space_sparkles';
    this.sparkleGfx.blendMode = 'add';
    pipeline.app.stage.addChild(this.sparkleGfx);
  }

  init(viewW: number, viewH: number): void {
    this.buildNebula();
    this.buildWisps();
    this.buildDust(viewW, viewH);
    this.buildSparkles(viewW, viewH);
    this.starfield.generate(viewW, viewH);
  }

  private buildNebula(): void {
    let phaseOff = 0;
    const rng = lcg(44412);

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
          // Offset each ring so the cloud looks irregular rather than perfectly circular
          const ox = (rng() - 0.5) * r * 0.38;
          const oy = (rng() - 0.5) * r * 0.38;
          g.circle(ox, oy, r);
          g.fill({ color: def.col, alpha: a });
        }
      }

      // 2–3 elongated lobe blobs break the circular silhouette
      const lobes = 2 + Math.floor(rng() * 2);
      for (let l = 0; l < lobes; l++) {
        const lobeR  = def.r * (0.28 + rng() * 0.32);
        const lobeOX = (rng() - 0.5) * def.r * 0.70;
        const lobeOY = (rng() - 0.5) * def.r * 0.70;
        const lobeA  = def.maxA * (0.10 + rng() * 0.18);
        g.circle(lobeOX, lobeOY, lobeR);
        g.fill({ color: def.col, alpha: lobeA });
        g.circle(lobeOX + lobeR * 0.30, lobeOY + lobeR * 0.20, lobeR * 0.70);
        g.fill({ color: def.col, alpha: lobeA * 0.60 });
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

  private buildWisps(): void {
    const rng = lcg(77331);
    for (let i = 0; i < 18; i++) {
      const angle   = rng() * Math.PI * 2;
      const length  = 150 + rng() * 300;   // 150–450 world units
      const width   = 6 + rng() * 12;      // 6–18 world units
      const alpha   = 0.03 + rng() * 0.07; // 0.03–0.10
      const color   = WISP_COLORS[Math.floor(rng() * WISP_COLORS.length)];

      const g = new Graphics();
      g.blendMode = 'add';
      const halfLen = length / 2;
      const halfW   = width / 2;
      g.roundRect(-halfLen, -halfW, length, width, halfW);
      g.fill({ color, alpha });

      const cont = new Container();
      cont.addChild(g);
      cont.rotation = angle;

      const baseX = (rng() * 2 - 1) * 1800;
      const baseY = (rng() * 2 - 1) * 1800;
      cont.x = baseX;
      cont.y = baseY;
      this.bgLayer.addChild(cont);

      this.wisps.push({
        container: cont,
        baseX,
        baseY,
        vx:       (rng() - 0.5) * 0.4,
        vy:       (rng() - 0.5) * 0.4,
        parallax: 0.02 + rng() * 0.04,
      });
    }
  }

  private buildDust(w: number, h: number): void {
    // Near layer — fast, bright, bluish
    const nearGfx = new Graphics();
    nearGfx.label = 'space_dust_near';
    nearGfx.blendMode = 'add';
    this.pipeline.app.stage.addChild(nearGfx);
    const rngNear = lcg(99);
    const nearParticles: DustParticle[] = [];
    for (let i = 0; i < 60; i++) {
      nearParticles.push({
        x:     rngNear() * w,
        y:     rngNear() * h,
        vx:    (rngNear() - 0.5) * 24,  // ±12 world units/s (applied * speed 1.0)
        vy:    (rngNear() - 0.5) * 24,
        size:  0.3 + rngNear() * 0.7,   // 0.3–1.0
        alpha: 0.12 + rngNear() * 0.16, // 0.12–0.28
      });
    }
    this.dustLayers.push({ gfx: nearGfx, particles: nearParticles, color: 0x8aaac8, speed: 1.0 });

    // Mid layer — medium, cooler
    const midGfx = new Graphics();
    midGfx.label = 'space_dust_mid';
    midGfx.blendMode = 'add';
    this.pipeline.app.stage.addChild(midGfx);
    const rngMid = lcg(4411);
    const midParticles: DustParticle[] = [];
    for (let i = 0; i < 50; i++) {
      midParticles.push({
        x:     rngMid() * w,
        y:     rngMid() * h,
        vx:    (rngMid() - 0.5) * 14,  // ±7 at speed 0.6 → effective ±~8.4 raw
        vy:    (rngMid() - 0.5) * 14,
        size:  0.2 + rngMid() * 0.45,  // 0.2–0.65
        alpha: 0.08 + rngMid() * 0.10, // 0.08–0.18
      });
    }
    this.dustLayers.push({ gfx: midGfx, particles: midParticles, color: 0x4a6688, speed: 0.6 });

    // Far layer — slow, very faint
    const farGfx = new Graphics();
    farGfx.label = 'space_dust_far';
    farGfx.blendMode = 'add';
    this.pipeline.app.stage.addChild(farGfx);
    const rngFar = lcg(8822);
    const farParticles: DustParticle[] = [];
    for (let i = 0; i < 35; i++) {
      farParticles.push({
        x:     rngFar() * w,
        y:     rngFar() * h,
        vx:    (rngFar() - 0.5) * 8,   // ±4 at speed 0.3 → effective ±~2.4 raw
        vy:    (rngFar() - 0.5) * 8,
        size:  0.15 + rngFar() * 0.25, // 0.15–0.4
        alpha: 0.04 + rngFar() * 0.06, // 0.04–0.10
      });
    }
    this.dustLayers.push({ gfx: farGfx, particles: farParticles, color: 0x223344, speed: 0.3 });
  }

  private buildSparkles(w: number, h: number): void {
    const rng = lcg(55123);
    for (let i = 0; i < 35; i++) {
      this.sparkles.push({
        x:     rng() * w,
        y:     rng() * h,
        size:  0.4 + rng() * 0.8,          // 0.4–1.2
        phase: rng() * Math.PI * 2,
        speed: 0.8 + rng() * 4.0,
      });
    }
  }

  update(camX: number, camY: number, dt: number): void {
    this.time += dt;
    const s  = this.pipeline.screen;
    const sw = s.width;
    const sh = s.height;

    // --- Nebula clouds ---
    for (const c of this.clouds) {
      const dx = Math.sin(this.time * c.freqX + c.phase) * c.driftAX;
      const dy = Math.cos(this.time * c.freqY + c.phase * 1.3) * c.driftAY;
      // Low parallax keeps nebula nearly stationary relative to camera
      c.container.x = c.baseX + dx + camX * (1 - c.parallax);
      c.container.y = c.baseY + dy + camY * (1 - c.parallax);
    }

    // --- Nebula wisps ---
    for (const w of this.wisps) {
      w.baseX += w.vx * dt;
      w.baseY += w.vy * dt;
      w.container.x = w.baseX + camX * (1 - w.parallax);
      w.container.y = w.baseY + camY * (1 - w.parallax);
    }

    // --- Starfield ---
    this.starfield.update(camX, camY, dt);

    // --- Three-layer dust (screen-space) ---
    for (const layer of this.dustLayers) {
      layer.gfx.clear();
      for (const p of layer.particles) {
        p.x += p.vx * layer.speed * dt;
        p.y += p.vy * layer.speed * dt;
        if (p.x < 0) p.x += sw;
        else if (p.x > sw) p.x -= sw;
        if (p.y < 0) p.y += sh;
        else if (p.y > sh) p.y -= sh;
        layer.gfx.circle(p.x, p.y, p.size);
        layer.gfx.fill({ color: layer.color, alpha: p.alpha });
      }
    }

    // --- Sparkle micro-particles (screen-space) ---
    this.sparkleGfx.clear();
    for (const sp of this.sparkles) {
      const t = 0.5 + 0.5 * Math.sin(this.time * sp.speed + sp.phase);
      // Only draw if above threshold — creates hard on/off glitter
      if (t > 0.72) {
        const a = (t - 0.72) / 0.28 * 0.7; // 0→0.7 range
        this.sparkleGfx.circle(sp.x, sp.y, sp.size);
        this.sparkleGfx.fill({ color: 0xeef6ff, alpha: a });
      }
    }
  }

  destroy(): void {
    for (const layer of this.dustLayers) {
      if (layer.gfx.parent) layer.gfx.parent.removeChild(layer.gfx);
      layer.gfx.destroy();
    }
    if (this.sparkleGfx.parent) this.sparkleGfx.parent.removeChild(this.sparkleGfx);
    this.sparkleGfx.destroy();
  }
}
