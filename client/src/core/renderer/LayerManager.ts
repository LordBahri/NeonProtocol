import { Container } from 'pixi.js';

export const RenderLayer = {
  BACKGROUND: 0,
  NEBULA: 1,
  ASTEROIDS: 2,
  SHIPS: 3,
  PROJECTILES: 4,
  FX_UNDER: 5,
  FX_OVER: 6,
  UI_WORLD: 7,
} as const;

export type RenderLayerKey = keyof typeof RenderLayer;

export class LayerManager {
  private layers = new Map<number, Container>();
  readonly root: Container;

  constructor() {
    this.root = new Container();
    this.root.label = 'root';

    const sortedValues = Object.values(RenderLayer).sort((a, b) => a - b);
    for (const value of sortedValues) {
      const container = new Container();
      container.label = `layer_${value}`;
      this.layers.set(value, container);
      this.root.addChild(container);
    }
  }

  get(layer: number): Container {
    const container = this.layers.get(layer);
    if (!container) throw new Error(`Layer ${layer} not found`);
    return container;
  }

  setLayerVisible(layer: number, visible: boolean): void {
    const container = this.layers.get(layer);
    if (container) container.visible = visible;
  }

  setLayerAlpha(layer: number, alpha: number): void {
    const container = this.layers.get(layer);
    if (container) container.alpha = alpha;
  }
}
