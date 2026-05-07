import { Container, Graphics } from 'pixi.js';
import type { RenderPipeline } from '../../core/renderer/RenderPipeline.ts';
import { RenderLayer } from '../../core/renderer/LayerManager.ts';

interface Asteroid {
  container: Container;
  rotationSpeed: number;
  vx: number;              // slow drift velocity in world units/s
  vy: number;
  minerals: Graphics | null;  // pre-drawn additive mineral glow, null if no minerals
  mineralPhase: number;       // random phase for mineral pulse animation
}

function lcg(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223;
    return (s >>> 0) / 0xffffffff;
  };
}

function drawPoly(g: Graphics, pts: number[]): void {
  g.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
  g.closePath();
}

export class AsteroidField {
  private readonly asteroids: Asteroid[] = [];
  private readonly layer: Container;
  private time = 0;

  constructor(pipeline: RenderPipeline, count = 40, seed = 777) {
    this.layer = pipeline.layers.get(RenderLayer.ASTEROIDS);
    this.generate(count, seed);
  }

  private generate(count: number, seed: number): void {
    const rng = lcg(seed);
    for (let i = 0; i < count; i++) {
      const angle    = rng() * Math.PI * 2;
      const dist     = 350 + rng() * 2600;
      const x        = Math.cos(angle) * dist;
      const y        = Math.sin(angle) * dist;
      const size     = 14 + rng() * 72;
      const rotSpeed = (rng() - 0.5) * 0.45;
      const vx       = (rng() - 0.5) * 0.35;
      const vy       = (rng() - 0.5) * 0.35;

      const hasMinerals  = rng() < 0.6;
      const minerals     = hasMinerals ? this.buildMinerals(size, rng) : null;
      const mineralPhase = rng() * Math.PI * 2;

      const gfx  = this.buildRock(size, rng);
      const cont = new Container();

      if (minerals) {
        cont.addChild(minerals);
      }
      cont.addChild(gfx);

      cont.x        = x;
      cont.y        = y;
      cont.rotation = rng() * Math.PI * 2;
      this.layer.addChild(cont);
      this.asteroids.push({ container: cont, rotationSpeed: rotSpeed, vx, vy, minerals, mineralPhase });
    }
  }

  private buildRock(size: number, rng: () => number): Graphics {
    const g  = new Graphics();
    const n  = 7 + Math.floor(rng() * 5); // 7-11 vertices
    const pts: number[] = [];

    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.35;
      const r = size * (0.55 + rng() * 0.45);
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }

    // Directional shadow layer — scaled + offset toward bottom-right
    const shadowPts = pts.map((v, idx) => v * 0.88 + (idx % 2 === 0 ? size * 0.12 : size * 0.14));
    drawPoly(g, shadowPts);
    g.fill({ color: 0x000208, alpha: 0.55 });

    // Dark base
    drawPoly(g, pts);
    g.fill({ color: 0x10161f });

    // Outer rim stroke
    drawPoly(g, pts);
    g.stroke({ color: 0x28394f, width: 1.2, alpha: 0.75 });

    // Inner shadow
    const inner = pts.map((v) => v * 0.72);
    drawPoly(g, inner);
    g.fill({ color: 0x080c12, alpha: 0.5 });

    // Rim highlight — bright edge facing top-left light source
    const rimPts = pts.map((v) => v * 0.92);
    drawPoly(g, rimPts);
    g.stroke({ color: 0x3d5a6e, width: 0.8, alpha: 0.45 });

    // Surface detail cracks on larger rocks
    if (size > 35) {
      const crackCount = 2 + Math.floor(rng() * 2); // 2-3 cracks
      for (let c = 0; c < crackCount; c++) {
        const idxA = Math.floor(rng() * (pts.length / 2)) * 2;
        const idxB = Math.floor(rng() * (pts.length / 2)) * 2;
        const ax = pts[idxA]! * (0.3 + rng() * 0.4);
        const ay = pts[idxA + 1]! * (0.3 + rng() * 0.4);
        const bx = pts[idxB]! * (0.3 + rng() * 0.4);
        const by = pts[idxB + 1]! * (0.3 + rng() * 0.4);
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke({ color: 0x1e2d3a, width: 0.6, alpha: 0.5 });
      }
    }

    // Highlight crack (visible on larger rocks, original detail)
    if (size > 40) {
      const hx = pts[0]! * 0.45;
      const hy = pts[1]! * 0.45;
      const hx2 = (pts[2] ?? pts[0])! * 0.38;
      const hy2 = (pts[3] ?? pts[1])! * 0.38;
      g.moveTo(hx, hy);
      g.lineTo(hx2, hy2);
      g.stroke({ color: 0x4a6a88, width: 0.8, alpha: 0.35 });
    }

    return g;
  }

  private buildMinerals(size: number, rng: () => number): Graphics {
    const g = new Graphics();
    g.blendMode = 'add';

    const MINERAL_COLORS = [0x00ddcc, 0xff6622, 0x8844ff, 0xffcc11, 0x00ff88];
    const count = 1 + Math.floor(rng() * 3); // 1-3 mineral spots

    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const dist  = size * (0.25 + rng() * 0.55); // somewhere on rock surface
      const mx    = Math.cos(angle) * dist;
      const my    = Math.sin(angle) * dist;
      const mr    = size * (0.04 + rng() * 0.08); // small spot
      const col   = MINERAL_COLORS[Math.floor(rng() * MINERAL_COLORS.length)]!;

      // outer soft glow
      g.circle(mx, my, mr * 2.8);
      g.fill({ color: col, alpha: 0.12 });
      // inner bright spot
      g.circle(mx, my, mr);
      g.fill({ color: col, alpha: 0.35 });
    }

    return g;
  }

  update(dt: number): void {
    this.time += dt;
    for (const a of this.asteroids) {
      a.container.rotation += a.rotationSpeed * dt;
      a.container.x += a.vx * dt;
      a.container.y += a.vy * dt;

      if (a.minerals) {
        // slow pulse: 0.6 → 1.0 alpha range
        a.minerals.alpha = 0.6 + 0.4 * Math.sin(this.time * 0.8 + a.mineralPhase);
      }
    }
  }

  destroy(): void {
    for (const a of this.asteroids) a.container.destroy({ children: true });
    this.asteroids.length = 0;
  }
}
