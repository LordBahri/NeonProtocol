import {
  Application,
  Container,
  Graphics,
  Sprite,
  Texture,
  BlurFilter,
} from 'pixi.js';
import { NebulaFilter } from '../../core/renderer/shaders/NebulaShader.js';

interface NebulaDef {
  color1: [number, number, number];
  color2: [number, number, number];
  color3: [number, number, number];
  density: number;
  scale: number;
  parallax: number;
  driftX: number;
  driftY: number;
}

const NEBULA_DEFS: NebulaDef[] = [
  {
    color1: [0.0, 0.10, 0.55], color2: [0.25, 0.0, 0.60], color3: [0.0, 0.40, 0.70],
    density: 0.30, scale: 2.0, parallax: 0.008, driftX: 4.0, driftY: 2.5,
  },
  {
    color1: [0.45, 0.0, 0.35], color2: [0.0, 0.35, 0.55], color3: [0.60, 0.0, 0.55],
    density: 0.22, scale: 1.6, parallax: 0.014, driftX: -3.0, driftY: 5.0,
  },
  {
    color1: [0.0, 0.30, 0.40], color2: [0.30, 0.05, 0.50], color3: [0.0, 0.55, 0.65],
    density: 0.18, scale: 2.8, parallax: 0.005, driftX: 2.5, driftY: -4.5,
  },
];

interface NebulaInstance {
  sprite: Sprite;
  filter: NebulaFilter;
  parallax: number;
  driftX: number;
  driftY: number;
  baseX: number;
  baseY: number;
}

/** Blob-cloud patches that add mid-field nebula depth */
interface NebulaPatch {
  gfx: Graphics;
  driftX: number;
  driftY: number;
  baseX: number;
  baseY: number;
  parallax: number;
}

export class NebulaLayer {
  readonly container: Container;

  private instances: NebulaInstance[] = [];
  private patches: NebulaPatch[] = [];
  private patchContainer: Container;
  private time = 0;

  constructor() {
    this.container     = new Container();
    this.container.label = 'nebula_layer';
    this.container.eventMode = 'none';

    this.patchContainer = new Container();
    this.patchContainer.label = 'nebula_patches';
    this.patchContainer.eventMode = 'none';
    this.container.addChild(this.patchContainer);
  }

  init(app: Application, seed = 7919): void {
    const sw = app.screen.width;
    const sh = app.screen.height;

    // ── Shader-driven fullscreen nebula passes ────────────────────────────────
    for (const def of NEBULA_DEFS) {
      const sprite = new Sprite(Texture.EMPTY);
      sprite.width  = sw;
      sprite.height = sh;
      sprite.eventMode = 'none';

      const filter = new NebulaFilter({
        color1:  def.color1,
        color2:  def.color2,
        color3:  def.color3,
        density: def.density,
        scale:   def.scale,
      });
      sprite.filters = [filter];

      this.container.addChild(sprite);
      this.instances.push({
        sprite, filter,
        parallax: def.parallax,
        driftX:   def.driftX,
        driftY:   def.driftY,
        baseX:    0,
        baseY:    0,
      });
    }

    // ── Soft blob patches for additional cloud density ────────────────────────
    const rand = lcg(seed);
    const BLOB_COLORS = [
      0x080040, 0x040030, 0x001a3a, 0x1a0040, 0x001530, 0x200040,
    ];
    const PATCH_COUNT = 12;
    const blur = new BlurFilter({ strength: 80, quality: 3 });
    this.patchContainer.filters = [blur];

    for (let i = 0; i < PATCH_COUNT; i++) {
      const gfx      = new Graphics();
      const baseX    = (rand() - 0.3) * sw * 2.2;
      const baseY    = (rand() - 0.3) * sh * 2.2;
      const radiusA  = 180 + rand() * 280;
      const radiusB  = 120 + rand() * 200;
      const color    = BLOB_COLORS[Math.floor(rand() * BLOB_COLORS.length)]!;
      const alphaMax = 0.25 + rand() * 0.35;

      // Concentric rings for soft-edge gradient
      const RINGS = 5;
      for (let r = RINGS; r > 0; r--) {
        const frac  = r / RINGS;
        const alpha = alphaMax * (1 - frac) * frac * 4;
        gfx.ellipse(baseX, baseY, radiusA * frac, radiusB * frac);
        gfx.fill({ color, alpha });
      }

      gfx.eventMode = 'none';
      this.patchContainer.addChild(gfx);

      this.patches.push({
        gfx,
        driftX:   (rand() - 0.5) * 6,
        driftY:   (rand() - 0.5) * 6,
        baseX,
        baseY,
        parallax: 0.005 + rand() * 0.01,
      });
    }

    this.container.addChild(this.patchContainer);
  }

  update(camX: number, camY: number, dt: number): void {
    this.time += dt;

    for (const inst of this.instances) {
      inst.filter.time = this.time;
      inst.sprite.x = -camX * inst.parallax + Math.sin(this.time * 0.05) * inst.driftX;
      inst.sprite.y = -camY * inst.parallax + Math.cos(this.time * 0.04) * inst.driftY;
    }

    for (const patch of this.patches) {
      patch.gfx.x = -camX * patch.parallax + Math.sin(this.time * 0.03 + patch.baseX) * 8;
      patch.gfx.y = -camY * patch.parallax + Math.cos(this.time * 0.025 + patch.baseY) * 8;
    }
  }

  resize(width: number, height: number): void {
    for (const inst of this.instances) {
      inst.sprite.width  = width;
      inst.sprite.height = height;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

function lcg(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}
