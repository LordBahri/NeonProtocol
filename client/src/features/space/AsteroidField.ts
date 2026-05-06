import { Container, Graphics } from 'pixi.js';
import type { RenderPipeline } from '../../core/renderer/RenderPipeline.ts';
import { RenderLayer } from '../../core/renderer/LayerManager.ts';

interface Asteroid {
  container: Container;
  rotationSpeed: number;
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

      const gfx  = this.buildRock(size, rng);
      const cont = new Container();
      cont.addChild(gfx);
      cont.x        = x;
      cont.y        = y;
      cont.rotation = rng() * Math.PI * 2;
      this.layer.addChild(cont);
      this.asteroids.push({ container: cont, rotationSpeed: rotSpeed });
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

    // Dark base
    drawPoly(g, pts);
    g.fill({ color: 0x10161f });

    // Outer rim
    drawPoly(g, pts);
    g.stroke({ color: 0x28394f, width: 1.2, alpha: 0.75 });

    // Inner shadow
    const inner = pts.map((v, idx) => v * (idx % 2 === 0 ? 0.72 : 0.72));
    drawPoly(g, inner);
    g.fill({ color: 0x080c12, alpha: 0.5 });

    // Highlight crack (visible on larger rocks)
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

  update(dt: number): void {
    for (const a of this.asteroids) {
      a.container.rotation += a.rotationSpeed * dt;
    }
  }

  destroy(): void {
    for (const a of this.asteroids) a.container.destroy({ children: true });
    this.asteroids.length = 0;
  }
}
