import { Container, Graphics, Sprite, Texture } from 'pixi.js';

interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinklePhase: number;
  twinkleSpeed: number;
  layer: number;
}

const LAYER_PARALLAX = [0.05, 0.15, 0.35];
const STAR_COUNTS = [200, 120, 60];
const STAR_COLORS = [0x334466, 0x556688, 0xaaccff];

export class StarfieldLayer {
  readonly container: Container;
  private layers: Container[] = [];
  private stars: Star[] = [];
  private starGraphics: Graphics[] = [];
  private time = 0;
  private readonly seed: number;

  constructor(seed = 42) {
    this.seed = seed;
    this.container = new Container();
    this.container.label = 'starfield';

    for (let i = 0; i < LAYER_PARALLAX.length; i++) {
      const layer = new Container();
      layer.label = `stars_${i}`;
      this.container.addChild(layer);
      this.layers.push(layer);
    }
  }

  generate(viewWidth: number, viewHeight: number): void {
    this.stars = [];
    for (const g of this.starGraphics) g.destroy();
    this.starGraphics = [];

    for (let layerIdx = 0; layerIdx < LAYER_PARALLAX.length; layerIdx++) {
      const layer = this.layers[layerIdx]!;
      layer.removeChildren();
      const count = STAR_COUNTS[layerIdx]!;
      const color = STAR_COLORS[layerIdx]!;

      for (let i = 0; i < count; i++) {
        const star: Star = {
          x: this.pseudoRandom(this.seed + layerIdx * 10000 + i * 7) * viewWidth * 2 - viewWidth,
          y: this.pseudoRandom(this.seed + layerIdx * 10000 + i * 13) * viewHeight * 2 - viewHeight,
          size: 0.5 + this.pseudoRandom(this.seed + i * 17) * (layerIdx === 2 ? 2 : 1),
          brightness: 0.4 + this.pseudoRandom(this.seed + i * 19) * 0.6,
          twinklePhase: this.pseudoRandom(this.seed + i * 23) * Math.PI * 2,
          twinkleSpeed: 0.5 + this.pseudoRandom(this.seed + i * 29) * 2,
          layer: layerIdx,
        };
        this.stars.push(star);

        const g = new Graphics();
        g.circle(0, 0, star.size);
        g.fill({ color, alpha: star.brightness });
        g.x = star.x;
        g.y = star.y;
        layer.addChild(g);
        this.starGraphics.push(g);
      }
    }
  }

  update(camX: number, camY: number, dt: number): void {
    this.time += dt;

    for (let layerIdx = 0; layerIdx < LAYER_PARALLAX.length; layerIdx++) {
      const parallax = LAYER_PARALLAX[layerIdx]!;
      this.layers[layerIdx]!.x = -camX * parallax;
      this.layers[layerIdx]!.y = -camY * parallax;
    }

    let starIdx = 0;
    for (const star of this.stars) {
      const twinkle = 0.7 + 0.3 * Math.sin(this.time * star.twinkleSpeed + star.twinklePhase);
      const g = this.starGraphics[starIdx];
      if (g) g.alpha = star.brightness * twinkle;
      starIdx++;
    }
  }

  private pseudoRandom(seed: number): number {
    const x = Math.sin(seed) * 43758.5453123;
    return x - Math.floor(x);
  }
}
