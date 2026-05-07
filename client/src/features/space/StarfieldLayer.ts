import { Container, Graphics } from 'pixi.js';

// Parallax factor: 0 = pinned to screen (infinite distance), 1 = moves with world.
const LAYERS = [
  { count: 160, parallax: 0.02, colors: [0x1a2233, 0x151c2a], sizeRange: [0.35, 0.65] },
  { count: 120, parallax: 0.06, colors: [0x263348, 0x1e2a3a], sizeRange: [0.45, 0.85] },
  { count:  90, parallax: 0.14, colors: [0x5a6e8a, 0x4a5e78], sizeRange: [0.55, 1.10] },
  { count:  55, parallax: 0.28, colors: [0x8eaac8, 0xb0cce0, 0xddeeff], sizeRange: [0.70, 1.40] },
  { count:  22, parallax: 0.48, colors: [0xe8f4ff, 0xffffff, 0xffeedd],  sizeRange: [1.00, 2.20] },
] as const;

interface Star {
  brightness: number;
  phase: number; speed: number;
  layer: number; gfx: Graphics;
}

function lcg(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223;
    return (s >>> 0) / 0xffffffff;
  };
}

export class StarfieldLayer {
  readonly container: Container;
  private layerContainers: Container[] = [];
  private stars: Star[] = [];
  private time = 0;
  private readonly seed: number;

  constructor(seed = 42) {
    this.seed = seed;
    this.container = new Container();
    this.container.label = 'starfield';
    for (let i = 0; i < LAYERS.length; i++) {
      const lc = new Container();
      lc.label = `stars_${i}`;
      this.container.addChild(lc);
      this.layerContainers.push(lc);
    }
  }

  generate(viewW: number, viewH: number): void {
    for (const s of this.stars) s.gfx.destroy();
    this.stars = [];
    for (const lc of this.layerContainers) lc.removeChildren();

    const rng = lcg(this.seed);

    for (let li = 0; li < LAYERS.length; li++) {
      const def = LAYERS[li]!;
      for (let i = 0; i < def.count; i++) {
        const x    = rng() * viewW * 2.6 - viewW * 1.3;
        const y    = rng() * viewH * 2.6 - viewH * 1.3;
        const [mn, mx] = def.sizeRange;
        const size = mn + rng() * (mx - mn);
        const bri  = 0.38 + rng() * 0.62;
        const phase = rng() * Math.PI * 2;
        const speed = 0.4 + rng() * 2.2;
        const ci   = Math.floor(rng() * def.colors.length);
        const col  = def.colors[ci % def.colors.length]!;

        const g = new Graphics();
        g.circle(0, 0, size);
        g.fill({ color: col, alpha: bri });

        if (size > 1.0) {
          g.circle(0, 0, size * 2.8);
          g.fill({ color: col, alpha: bri * 0.12 });
          g.blendMode = 'add';
        }

        // Lens-flare cross on the very brightest stars
        if (li === 4 && size > 1.6) {
          const fl = size * 5;
          g.moveTo(-fl, 0); g.lineTo(fl, 0);
          g.stroke({ color: col, width: 0.5, alpha: bri * 0.22 });
          g.moveTo(0, -fl); g.lineTo(0, fl);
          g.stroke({ color: col, width: 0.5, alpha: bri * 0.22 });
        }

        g.x = x; g.y = y;
        this.layerContainers[li]!.addChild(g);
        this.stars.push({ brightness: bri, phase, speed, layer: li, gfx: g });
      }
    }
  }

  update(camX: number, camY: number, dt: number): void {
    this.time += dt;

    for (let li = 0; li < LAYERS.length; li++) {
      const p  = LAYERS[li]!.parallax;
      const lc = this.layerContainers[li]!;
      lc.x = camX * (1 - p);
      lc.y = camY * (1 - p);
    }

    for (const s of this.stars) {
      if (s.layer >= 2) {
        const tw = 0.62 + 0.38 * Math.sin(this.time * s.speed + s.phase);
        s.gfx.alpha = s.brightness * tw;
      }
    }
  }
}
