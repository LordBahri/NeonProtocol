import type { Application } from 'pixi.js';
import { Container } from 'pixi.js';
import { StarField } from './StarField.js';
import { NebulaLayer } from './NebulaLayer.js';
import { FogCloud } from './FogCloud.js';
import { DustParticles } from './DustParticles.js';
import type { RenderPipeline } from '../../core/renderer/RenderPipeline.js';

export interface SpaceRendererOptions {
  seed?: number;
  nebulaSeed?: number;
  fogSeed?: number;
  dustSeed?: number;
}

/**
 * Master space rendering orchestrator. Adds all background layers to the
 * PixiJS stage in the correct draw order:
 *
 *   [0] NebulaLayer  — fullscreen FBM shader + blob patches (deepest)
 *   [1] StarField    — 3-layer parallax TilingSprite stars
 *   [2] FogCloud     — slow volumetric fog
 *   [3] DustParticles — fine additive dust (nearest to camera)
 *
 * All layers live in screen space (app.stage, behind worldContainer) so
 * they are never camera-transformed. Parallax is applied manually via
 * tilePosition / container offset in each layer's update().
 */
export class SpaceRenderer {
  readonly nebula: NebulaLayer;
  readonly stars: StarField;
  readonly fog: FogCloud;
  readonly dust: DustParticles;

  private screenContainer: Container;

  constructor() {
    this.nebula = new NebulaLayer();
    this.stars  = new StarField();
    this.fog    = new FogCloud();
    this.dust   = new DustParticles();

    this.screenContainer       = new Container();
    this.screenContainer.label = 'space_bg';
    this.screenContainer.eventMode = 'none';

    this.screenContainer.addChild(this.nebula.container);
    this.screenContainer.addChild(this.stars.container);
    this.screenContainer.addChild(this.fog.container);
    this.screenContainer.addChild(this.dust.container);
  }

  /**
   * Call once after the PixiJS Application has been initialised.
   * Inserts the background behind all other stage content.
   */
  init(app: Application, _pipeline: RenderPipeline, opts: SpaceRendererOptions = {}): void {

    const {
      seed      = 42,
      nebulaSeed = 7919,
      fogSeed   = 31337,
      dustSeed  = 55555,
    } = opts;

    // Insert at index 0 so we sit behind worldContainer
    app.stage.addChildAt(this.screenContainer, 0);

    // Initialise each layer (order matters — stars need app.renderer)
    this.nebula.init(app, nebulaSeed);
    this.stars.init(app, seed);
    this.fog.init(app.screen.width, app.screen.height, fogSeed);
    this.dust.init(app, dustSeed);
  }

  update(camX: number, camY: number, dt: number): void {
    this.nebula.update(camX, camY, dt);
    this.stars.update(camX, camY);
    this.fog.update(dt);
    this.dust.update(camX, camY, dt);
  }

  resize(width: number, height: number): void {
    this.nebula.resize(width, height);
    this.stars.resize(width, height);
    this.fog.resize(width, height);
    this.dust.resize(width, height);
  }

  destroy(): void {
    this.nebula.destroy();
    this.stars.destroy();
    this.fog.destroy();
    this.dust.destroy();
    this.screenContainer.destroy({ children: false });
  }
}
