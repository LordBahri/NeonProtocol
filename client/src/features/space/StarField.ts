import {
  Application,
  Container,
  Graphics,
  RenderTexture,
  TilingSprite,
} from 'pixi.js';

interface StarLayerCfg {
  tileW: number;
  tileH: number;
  parallax: number;
  count: number;
  minSize: number;
  maxSize: number;
  colors: number[];
  glowChance: number;
}

const LAYERS: StarLayerCfg[] = [
  // Far — dim, tiny, barely moves
  { tileW: 2048, tileH: 2048, parallax: 0.025, count: 280, minSize: 0.4, maxSize: 0.9,
    colors: [0x334466, 0x445577, 0x223355], glowChance: 0.0 },
  // Mid — medium brightness
  { tileW: 1536, tileH: 1536, parallax: 0.09, count: 150, minSize: 0.7, maxSize: 1.4,
    colors: [0x7799bb, 0x88aacc, 0x99bbdd, 0xaaccee], glowChance: 0.05 },
  // Near — bright, with occasional glow halo
  { tileW: 1024, tileH: 1024, parallax: 0.22, count: 65, minSize: 1.0, maxSize: 2.5,
    colors: [0xcceeff, 0xffffff, 0xaaddff, 0xddffff], glowChance: 0.3 },
];

function lcg(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

export class StarField {
  private sprites: TilingSprite[] = [];
  private parallaxFactors: number[] = [];
  readonly container: Container;

  constructor() {
    this.container = new Container();
    this.container.label = 'starfield';
    this.container.eventMode = 'none';
  }

  init(app: Application, seed = 42): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites = [];
    this.parallaxFactors = [];

    const sw = app.screen.width;
    const sh = app.screen.height;

    for (let li = 0; li < LAYERS.length; li++) {
      const cfg = LAYERS[li]!;
      const rand = lcg(seed + li * 997);

      // Draw stars onto a RenderTexture tile
      const rt = RenderTexture.create({ width: cfg.tileW, height: cfg.tileH });
      const gfx = new Graphics();

      for (let i = 0; i < cfg.count; i++) {
        const x     = rand() * cfg.tileW;
        const y     = rand() * cfg.tileH;
        const size  = cfg.minSize + rand() * (cfg.maxSize - cfg.minSize);
        const alpha = 0.35 + rand() * 0.65;
        const color = cfg.colors[Math.floor(rand() * cfg.colors.length)]!;

        // Star core
        gfx.circle(x, y, size);
        gfx.fill({ color, alpha });

        // Diffuse glow halo
        if (rand() < cfg.glowChance) {
          gfx.circle(x, y, size * 3.5);
          gfx.fill({ color, alpha: alpha * 0.12 });
          gfx.circle(x, y, size * 6);
          gfx.fill({ color, alpha: alpha * 0.04 });
        }
      }

      app.renderer.render({ container: gfx, target: rt, clear: true });
      gfx.destroy();

      const tile = new TilingSprite({
        texture: rt,
        width: sw,
        height: sh,
      });
      tile.label       = `star_layer_${li}`;
      tile.eventMode   = 'none';
      tile.alpha       = li === 0 ? 0.7 : 1.0;

      this.container.addChild(tile);
      this.sprites.push(tile);
      this.parallaxFactors.push(cfg.parallax);
    }
  }

  update(camX: number, camY: number): void {
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i]!;
      const p      = this.parallaxFactors[i]!;
      sprite.tilePosition.x = -camX * p;
      sprite.tilePosition.y = -camY * p;
    }
  }

  resize(width: number, height: number): void {
    for (const sprite of this.sprites) {
      sprite.width  = width;
      sprite.height = height;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
