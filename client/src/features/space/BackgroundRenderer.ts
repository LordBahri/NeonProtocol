import { Container, Graphics, type ColorSource } from 'pixi.js';
import { StarfieldLayer } from './StarfieldLayer.ts';
import type { RenderPipeline } from '../../core/renderer/RenderPipeline.ts';
import { RenderLayer } from '../../core/renderer/LayerManager.ts';

interface NebulaPatch {
  x: number;
  y: number;
  radius: number;
  color: ColorSource;
  alpha: number;
}

export class BackgroundRenderer {
  private starfield: StarfieldLayer;
  private nebulaContainer: Container;
  private readonly pipeline: RenderPipeline;

  constructor(pipeline: RenderPipeline) {
    this.pipeline = pipeline;
    this.starfield = new StarfieldLayer(12345);
    this.nebulaContainer = new Container();
    this.nebulaContainer.label = 'nebula';

    const bgLayer = pipeline.layers.get(RenderLayer.BACKGROUND);
    bgLayer.addChild(this.starfield.container);
    bgLayer.addChild(this.nebulaContainer);
  }

  init(viewWidth: number, viewHeight: number, nebulaSeed = 9999): void {
    this.starfield.generate(viewWidth, viewHeight);
    this.generateNebula(viewWidth, viewHeight, nebulaSeed);
  }

  private generateNebula(viewWidth: number, viewHeight: number, seed: number): void {
    this.nebulaContainer.removeChildren();

    const patches: NebulaPatch[] = [
      { x: viewWidth * 0.2, y: viewHeight * 0.3, radius: 300, color: 0x0a0040, alpha: 0.4 },
      { x: -viewWidth * 0.3, y: -viewHeight * 0.1, radius: 400, color: 0x001a1a, alpha: 0.35 },
      { x: viewWidth * 0.5, y: -viewHeight * 0.4, radius: 250, color: 0x100020, alpha: 0.3 },
      { x: -viewWidth * 0.1, y: viewHeight * 0.5, radius: 350, color: 0x001500, alpha: 0.25 },
    ];

    for (const patch of patches) {
      const g = new Graphics();
      for (let i = 4; i > 0; i--) {
        const r = patch.radius * (i / 4);
        const a = patch.alpha * (1 - i / 5);
        g.circle(patch.x, patch.y, r);
        g.fill({ color: patch.color, alpha: a });
      }
      this.nebulaContainer.addChild(g);
    }
  }

  update(camX: number, camY: number, dt: number): void {
    this.starfield.update(camX, camY, dt);
    this.nebulaContainer.x = -camX * 0.02;
    this.nebulaContainer.y = -camY * 0.02;
  }
}
