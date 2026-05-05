import { Application, Container, Graphics, RenderTexture, TilingSprite } from 'pixi.js';

const DUST_TILE = 768;
const DUST_COUNT = 420;
const PARALLAX = 0.85;

const COLORS = [0x334466, 0x445577, 0x223355, 0x556688, 0x667799];

function lcg(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

/**
 * Fine spatial dust — a dense TilingSprite layer that moves almost with the
 * camera (high parallax), giving the sensation of nearby micro-particles.
 * Alpha oscillates per-frame via a global sine wave for a shimmering effect.
 */
export class DustParticles {
  readonly container: Container;
  private sprite!: TilingSprite;
  private time = 0;

  constructor() {
    this.container       = new Container();
    this.container.label = 'dust';
    this.container.eventMode = 'none';
  }

  init(app: Application, seed = 55555): void {
    const rand = lcg(seed);
    const rt   = RenderTexture.create({ width: DUST_TILE, height: DUST_TILE });
    const gfx  = new Graphics();

    for (let i = 0; i < DUST_COUNT; i++) {
      const x     = rand() * DUST_TILE;
      const y     = rand() * DUST_TILE;
      const size  = 0.3 + rand() * 0.7;
      const alpha = 0.15 + rand() * 0.5;
      const color = COLORS[Math.floor(rand() * COLORS.length)]!;
      gfx.circle(x, y, size);
      gfx.fill({ color, alpha });
    }

    app.renderer.render({ container: gfx, target: rt, clear: true });
    gfx.destroy();

    this.sprite = new TilingSprite({
      texture: rt,
      width:   app.screen.width,
      height:  app.screen.height,
    });
    this.sprite.blendMode   = 'add';
    this.sprite.eventMode   = 'none';
    this.sprite.alpha       = 0.6;

    this.container.addChild(this.sprite);
  }

  update(camX: number, camY: number, dt: number): void {
    if (!this.sprite) return;
    this.time += dt;
    this.sprite.tilePosition.x = -camX * PARALLAX;
    this.sprite.tilePosition.y = -camY * PARALLAX;
    // Gentle shimmer
    this.sprite.alpha = 0.45 + Math.sin(this.time * 1.4) * 0.15;
  }

  resize(width: number, height: number): void {
    if (this.sprite) {
      this.sprite.width  = width;
      this.sprite.height = height;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
