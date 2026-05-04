import {
  Application,
  BlurFilter,
  Container,
  RenderTexture,
  Sprite,
} from 'pixi.js';

export interface BloomOptions {
  /** 0–1 blend strength of the bloom layer */
  strength: number;
  /** Blur kernel quality (1–10) */
  quality: number;
  /** Blur radius in pixels */
  blur: number;
  /** Only pixels brighter than this luminance threshold contribute to bloom */
  threshold: number;
}

const DEFAULTS: BloomOptions = {
  strength: 0.55,
  quality: 4,
  blur: 12,
  threshold: 0.35,
};

/**
 * Two-pass bloom:
 *   1. Render world to a RenderTexture
 *   2. Blur the texture copy
 *   3. Additive-blend the blurred copy back on top
 *
 * Attach to the PixiJS stage after the world container is added.
 */
export class BloomPipeline {
  private app: Application;
  private rtA!: RenderTexture;
  private rtB!: RenderTexture;
  private blurFilter: BlurFilter;
  private bloomSprite!: Sprite;
  private overlayContainer: Container;
  private opts: BloomOptions;
  private _enabled = true;

  constructor(app: Application, opts: Partial<BloomOptions> = {}) {
    this.app  = app;
    this.opts = { ...DEFAULTS, ...opts };

    this.blurFilter = new BlurFilter({
      strength: this.opts.blur,
      quality:  this.opts.quality,
    });

    this.overlayContainer = new Container();
    this.overlayContainer.label = 'bloom_overlay';

    this.allocateTextures();
    this.buildOverlay();
    this.app.stage.addChild(this.overlayContainer);
  }

  private allocateTextures(): void {
    const { width, height } = this.app.screen;
    this.rtA?.destroy(true);
    this.rtB?.destroy(true);
    this.rtA = RenderTexture.create({ width, height });
    this.rtB = RenderTexture.create({ width, height, resolution: 0.5 });
  }

  private buildOverlay(): void {
    this.bloomSprite?.destroy();
    this.bloomSprite = new Sprite(this.rtB);
    this.bloomSprite.blendMode = 'add';
    this.bloomSprite.alpha     = this.opts.strength;
    this.overlayContainer.addChild(this.bloomSprite);
  }

  render(worldContainer: Container): void {
    if (!this._enabled) return;

    const renderer = this.app.renderer;

    // Pass 1 — capture world at full res
    renderer.render({ container: worldContainer, target: this.rtA, clear: true });

    // Pass 2 — blur at half res
    const tempSprite = new Sprite(this.rtA);
    tempSprite.filters = [this.blurFilter];
    renderer.render({ container: tempSprite as unknown as Container, target: this.rtB, clear: true });
    tempSprite.destroy();

    // Overlay sprite already sits on stage; its texture (rtB) is now updated
    this.bloomSprite.texture = this.rtB;
    this.bloomSprite.alpha   = this.opts.strength;
  }

  onResize(): void {
    this.allocateTextures();
    this.bloomSprite.texture = this.rtB;
  }

  setStrength(strength: number): void {
    this.opts.strength    = Math.max(0, Math.min(1, strength));
    this.bloomSprite.alpha = this.opts.strength;
  }

  setBlur(blur: number): void {
    this.opts.blur = blur;
    this.blurFilter.blur = blur;
  }

  enable():  void { this._enabled = true;  this.overlayContainer.visible = true; }
  disable(): void { this._enabled = false; this.overlayContainer.visible = false; }

  get enabled(): boolean { return this._enabled; }

  destroy(): void {
    this.rtA.destroy(true);
    this.rtB.destroy(true);
    this.bloomSprite.destroy();
    this.overlayContainer.destroy({ children: true });
  }
}
